import "server-only";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";

export type SectionData = {
  id: string;
  key: string;
  type: string;
  label: string;
  sortOrder: number;
  active: boolean;
  title: string | null;
  subtitle: string | null;
  body: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  ctaLabel: string | null;
  ctaTarget: string | null;
  config: Record<string, unknown>;
};

export const getLandingSections = unstable_cache(
  async (): Promise<SectionData[]> => {
    const rows = await db.landingSection.findMany({ orderBy: { sortOrder: "asc" } });
    if (!rows.length) throw new Error("landing vazia"); // nunca guarda vazio no cache
    return rows.map((r) => ({ ...r, config: (r.config && typeof r.config === "object" ? r.config : {}) as Record<string, unknown> }));
  },
  ["landing-sections-v2"],
  { tags: ["landing"], revalidate: 300 }
);

export const getGallery = unstable_cache(
  async () => db.galleryItem.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
  ["gallery-v2"],
  { tags: ["gallery"], revalidate: 300 }
);

export const getFaqs = unstable_cache(
  async () => db.faq.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
  ["faqs-v2"],
  { tags: ["faq"], revalidate: 300 }
);

/** Somente avaliações reais aprovadas pelo admin. */
export const getApprovedReviews = unstable_cache(
  async () =>
    db.review
      .findMany({ where: { approved: true }, orderBy: [{ featured: "desc" }, { sortOrder: "asc" }, { createdAt: "desc" }], take: 24, include: { product: { select: { name: true } } } }),
  ["reviews-v2"],
  { tags: ["reviews"], revalidate: 300 }
);

/** Oferta ativa (order bump) de um produto — usada para anunciar o preço especial na landing. */
export const getActiveBumpForProduct = unstable_cache(
  async (productId: string) => db.orderBump.findFirst({ where: { productId, active: true }, select: { priceCents: true, showModal: true } }),
  ["bump-for-product-v2"],
  { tags: ["catalog"], revalidate: 300 }
);

export const cfgStr = (c: Record<string, unknown>, k: string) => (typeof c[k] === "string" ? (c[k] as string) : "");
export const cfgArr = <T,>(c: Record<string, unknown>, k: string): T[] => (Array.isArray(c[k]) ? (c[k] as T[]) : []);

/**
 * Leitura resiliente: tenta o cache; se falhar (banco acordando), tenta de novo direto no banco;
 * se ainda falhar, devolve o valor padrão SEM guardar no cache.
 */
export async function safeLoad<T>(cached: () => Promise<T>, direct: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await cached();
  } catch {
    try {
      return await direct();
    } catch {
      return fallback;
    }
  }
}

export const loadLandingSectionsDirect = async (): Promise<SectionData[]> =>
  (await db.landingSection.findMany({ orderBy: { sortOrder: "asc" } })).map((r) => ({ ...r, config: (r.config && typeof r.config === "object" ? r.config : {}) as Record<string, unknown> }));
