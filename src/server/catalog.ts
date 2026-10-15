import "server-only";
import { unstable_cache } from "next/cache";
import { cookies } from "next/headers";
import type { Product } from "@prisma/client";
import { db } from "@/lib/db";
import { assignAll, priceOverrides, type Assignment, type ExperimentDef, type ExperimentVariant } from "@/lib/experiments";
import { effectivePrice } from "@/lib/pricing";
import type { GalleryImage, ProductSpec } from "@/lib/domain";
import type { PublicMaterial, PublicProduct } from "@/types/catalog";

const asArray = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** Produtos ativos (cache invalidado pela tag "catalog" em qualquer edição no admin). */
export const getActiveProducts = unstable_cache(
  async () => db.product.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
  ["active-products"],
  { tags: ["catalog"], revalidate: 300 }
);

export const getActiveExperiments = unstable_cache(
  async (): Promise<ExperimentDef[]> => {
    const rows = await db.experiment.findMany({ where: { active: true } }); // erro não vai para o cache
    return rows.map((r) => ({ key: r.key, target: r.target, variants: asArray<ExperimentVariant>(r.variants) }));
  },
  ["active-experiments-v2"],
  { tags: ["experiments"], revalidate: 300 }
);

export async function assignmentsFor(visitorId: string | null | undefined): Promise<Assignment[]> {
  return assignAll(visitorId, await getActiveExperiments().catch(() => []));
}

/** Variantes A/B do visitante atual (cookie hb_vid, definido pelo middleware). */
export async function currentAssignments(): Promise<Assignment[]> {
  const vid = (await cookies()).get("adf_vid")?.value;
  return assignmentsFor(vid);
}

export function toPublicProduct(p: Product, overrides: Record<string, number> = {}): PublicProduct {
  const price = effectivePrice(p, overrides);
  return {
    id: p.id,
    slug: p.slug,
    sku: p.sku,
    name: p.name,
    subtitle: p.subtitle,
    category: p.category,
    fulfillment: p.fulfillment,
    shortDescription: p.shortDescription,
    description: p.description,
    priceCents: price.priceCents,
    listPriceCents: price.listPriceCents,
    promoLabel: price.promoLabel,
    promoEndsAt: price.promoEndsAt,
    specs: asArray<ProductSpec>(p.specs).filter((s) => s?.label && s?.value),
    imageUrl: p.imageUrl,
    gallery: asArray<GalleryImage>(p.gallery).filter((g) => g?.url),
    videoUrl: p.videoUrl,
    badge: p.badge,
    featured: p.featured,
    crossSellIds: asArray<string>(p.crossSellIds),
    includedProductIds: asArray<string>(p.includedProductIds),
    deliveryFormat: p.deliveryFormat,
    digitalDeliveryNote: p.digitalDeliveryNote,
    sortOrder: p.sortOrder,
    seoTitle: p.seoTitle,
    seoDescription: p.seoDescription,
  };
}

/** Produto vendável: ativo e com preço válido (produtos sem preço definido nunca aparecem). */
export const isSellable = (p: Pick<Product, "active" | "priceCents">) => p.active && p.priceCents > 0;

export async function getPublicCatalog(assignments?: Assignment[]) {
  const [products, list] = await Promise.all([getActiveProducts(), assignments ? Promise.resolve(assignments) : currentAssignments()]);
  const overrides = priceOverrides(list);
  return products.filter((p) => p.priceCents > 0).map((p) => toPublicProduct(p, overrides));
}

export async function getPublicProduct(slug: string) {
  const products = await getPublicCatalog();
  return products.find((p) => p.slug === slug) ?? null;
}

/** Planos da landing: produtos ativos da categoria PROGRAMA, na ordem do admin (ex.: E-book R$ 67 · Completo R$ 97). */
export async function getPlans(assignments?: Assignment[]) {
  const list = await getPublicCatalog(assignments);
  const plans = list.filter((p) => p.category === "PROGRAM");
  return plans.length ? plans : list.slice(0, 1);
}

/** Produto principal (primeiro plano) — usado em métricas/eventos da landing. */
export async function getMainProduct(assignments?: Assignment[]) {
  return (await getPlans(assignments))[0] ?? null;
}

/** Produtos cujos materiais um produto entrega: ele mesmo + os "já inclusos" (ex.: Completo inclui o E-book). */
export async function materialProductIds(productId: string): Promise<string[]> {
  const p = await db.product.findUnique({ where: { id: productId }, select: { includedProductIds: true } });
  return [productId, ...asArray<string>(p?.includedProductIds).filter((x) => typeof x === "string" && x !== productId)];
}

/** Materiais PRONTOS para a landing (de cada plano, incluindo os herdados) — sem arquivo/link (entregues só após o pagamento). */
export const getLandingMaterials = unstable_cache(
  async (productId: string): Promise<PublicMaterial[]> => {
    const ids = await materialProductIds(productId);
    const rows = await db.digitalMaterial.findMany({
      where: { productId: { in: ids }, status: "READY", showOnLanding: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, productId: true, title: true, description: true, howToUse: true, purpose: true, format: true, coverUrl: true },
    });
    // materiais herdados primeiro (ex.: o e-book antes do curso)
    return rows.sort((x, y) => ids.indexOf(y.productId) - ids.indexOf(x.productId)).map(({ productId: _p, ...m }) => m);
  },
  ["landing-materials-v2"],
  { tags: ["catalog"], revalidate: 300 }
);

const deliverable = { status: "READY" as const, OR: [{ source: "link", externalUrl: { not: null } }, { source: "file", uploadId: { not: null } }] };

/** Quantos materiais entregáveis o produto tem (próprios + inclusos) — o checkout exige pelo menos um. */
export async function readyMaterialCount(productId: string) {
  return db.digitalMaterial.count({ where: { productId: { in: await materialProductIds(productId) }, ...deliverable } });
}
