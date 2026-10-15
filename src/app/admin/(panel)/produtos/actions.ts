"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma, type ProductCategory } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import type { ProductSpec } from "@/lib/domain";
import { formatBRL, slugify } from "@/utils/format";
import { refreshStore, withAdmin, withAdminVoid, type ActionResult } from "@/server/admin/guard";
import { bool, int, jsonArray, optStr, parseLocalDateTime, parseMoney, str } from "@/server/admin/forms";

const CATEGORIES: ProductCategory[] = ["PROGRAM", "EBOOK", "JOURNAL", "AUDIO", "VIDEO", "BONUS", "OTHER"];

const optInt = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "").replace(/\D/g, "");
  return v ? Math.min(10_000_000, Number.parseInt(v, 10)) : null;
};
const ids = (fd: FormData, k: string) => jsonArray<string>(fd, k).filter((x) => typeof x === "string" && /^[a-z0-9]+$/i.test(x));

function parseProduct(fd: FormData) {
  const name = str(fd, "name", 120);
  if (name.length < 2) throw new Error("Informe o nome do produto.");
  const price = parseMoney(fd.get("price"));
  if (price == null) throw new Error("Preço inválido.");
  const active = bool(fd, "active");
  if (active && price <= 0) throw new Error("Defina um preço maior que zero para ativar o produto.");
  const compareAt = parseMoney(fd.get("compareAt"));
  if (compareAt != null && compareAt > 0 && compareAt <= price) throw new Error("O preço anterior precisa ser maior que o preço atual (ou deixe em branco).");
  const promoPrice = parseMoney(fd.get("promoPrice"));
  const promoStartsAt = parseLocalDateTime(fd.get("promoStartsAt"));
  const promoEndsAt = parseLocalDateTime(fd.get("promoEndsAt"));
  if (promoPrice && (!promoStartsAt || !promoEndsAt || promoEndsAt <= promoStartsAt)) throw new Error("Promoção precisa de data inicial e final válidas.");
  const category = str(fd, "category", 20) as ProductCategory;

  const specs: ProductSpec[] = jsonArray<ProductSpec>(fd, "specs")
    .filter((s) => s?.label && s?.value)
    .slice(0, 30)
    .map((s) => ({ label: String(s.label).slice(0, 80), value: String(s.value).slice(0, 200) }));
  const gallery = jsonArray<{ url: string; alt?: string }>(fd, "gallery")
    .filter((g) => g?.url && /^(https:\/\/|\/)/.test(g.url))
    .slice(0, 20)
    .map((g) => ({ url: g.url.slice(0, 500), alt: String(g.alt ?? "").slice(0, 160) }));
  const url = (k: string) => {
    const v = optStr(fd, k, 500);
    return v && /^(https:\/\/|\/)/.test(v) ? v : null;
  };

  return {
    name,
    slug: slugify(str(fd, "slug", 80) || name),
    sku: str(fd, "sku", 40).toUpperCase() || `AF-${slugify(name).toUpperCase().slice(0, 20)}`,
    category: CATEGORIES.includes(category) ? category : "OTHER",
    fulfillment: "DIGITAL" as const,
    subtitle: optStr(fd, "subtitle", 160),
    shortDescription: optStr(fd, "shortDescription", 300),
    description: optStr(fd, "description", 5000),
    priceCents: price,
    compareAtPriceCents: compareAt && compareAt > 0 ? compareAt : null,
    promoPriceCents: promoPrice && promoPrice > 0 ? promoPrice : null,
    promoStartsAt: promoPrice ? promoStartsAt : null,
    promoEndsAt: promoPrice ? promoEndsAt : null,
    promoLabel: promoPrice ? optStr(fd, "promoLabel", 60) : null,
    specs: specs as unknown as Prisma.InputJsonValue,
    imageUrl: url("imageUrl"),
    gallery: gallery as unknown as Prisma.InputJsonValue,
    videoUrl: url("videoUrl"),
    badge: optStr(fd, "badge", 40),
    featured: bool(fd, "featured"),
    active,
    sortOrder: int(fd, "sortOrder", 0),
    crossSellIds: ids(fd, "crossSellIds"),
    includedProductIds: ids(fd, "includedProductIds"),
    deliveryFormat: optStr(fd, "deliveryFormat", 160),
    digitalDeliveryNote: optStr(fd, "digitalDeliveryNote", 600),
    digitalMaxDownloads: optInt(fd, "digitalMaxDownloads"),
    digitalValidityDays: optInt(fd, "digitalValidityDays"),
    seoTitle: optStr(fd, "seoTitle", 70),
    seoDescription: optStr(fd, "seoDescription", 170),
  };
}

export async function saveProduct(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return withAdmin("ADMIN", async (admin) => {
    const id = optStr(fd, "id", 40);
    const data = parseProduct(fd);
    if (!id) {
      const created = await db.product.create({ data });
      await db.priceHistory.create({ data: { productId: created.id, oldPriceCents: null, newPriceCents: created.priceCents, adminId: admin.id } });
      await audit(admin.id, "product_created", "product", created.id, { summary: `Produto criado: ${created.name} (${formatBRL(created.priceCents)})`, after: data as unknown as Record<string, unknown> });
      refreshStore("catalog", "landing");
      redirect(`/admin/produtos/${created.id}?salvo=1`);
    }
    const before = await db.product.findUniqueOrThrow({ where: { id } });
    const updated = await db.product.update({ where: { id }, data });
    const summaries: string[] = [];
    if (before.priceCents !== updated.priceCents) {
      await db.priceHistory.create({ data: { productId: id, oldPriceCents: before.priceCents, newPriceCents: updated.priceCents, adminId: admin.id } });
      summaries.push(`Preço do ${updated.name} alterado de ${formatBRL(before.priceCents)} para ${formatBRL(updated.priceCents)}`);
    }
    if (before.active !== updated.active) summaries.push(`${updated.name} ${updated.active ? "ativado" : "desativado"}`);
    await audit(admin.id, "product_updated", "product", id, {
      summary: summaries.join(" · ") || `Produto ${updated.name} atualizado`,
      before: before as unknown as Record<string, unknown>,
      after: updated as unknown as Record<string, unknown>,
    });
    refreshStore("catalog", "landing");
    revalidatePath("/admin/produtos");
    return { ok: true, message: summaries[0] ? `${summaries[0]}.` : "Produto salvo." };
  });
}

export async function duplicateProduct(fd: FormData) {
  let newId = "";
  await withAdminVoid("ADMIN", async (admin) => {
    const src = await db.product.findUniqueOrThrow({ where: { id: str(fd, "id", 40) } });
    const suffix = Date.now().toString(36).slice(-4);
    const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = src;
    const copy = await db.product.create({
      data: { ...rest, name: `${src.name} (cópia)`, slug: `${src.slug}-copia-${suffix}`, sku: `${src.sku}-C${suffix.toUpperCase()}`, active: false, specs: src.specs as Prisma.InputJsonValue, gallery: src.gallery as Prisma.InputJsonValue, crossSellIds: src.crossSellIds as Prisma.InputJsonValue, includedProductIds: src.includedProductIds as Prisma.InputJsonValue },
    });
    await audit(admin.id, "product_duplicated", "product", copy.id, { summary: `Produto duplicado de ${src.name}` });
    newId = copy.id;
  });
  redirect(`/admin/produtos/${newId}`);
}

export async function toggleProduct(fd: FormData) {
  await withAdminVoid("ADMIN", async (admin) => {
    const p = await db.product.findUniqueOrThrow({ where: { id: str(fd, "id", 40) } });
    if (!p.active && p.priceCents <= 0) return; // sem preço não ativa (o selo "definir" orienta o admin)
    await db.product.update({ where: { id: p.id }, data: { active: !p.active } });
    await audit(admin.id, "product_updated", "product", p.id, { summary: `${p.name} ${p.active ? "desativado" : "ativado"}`, before: { active: p.active }, after: { active: !p.active } });
    refreshStore("catalog", "landing");
    revalidatePath("/admin/produtos");
  });
}

export async function moveProduct(fd: FormData) {
  await withAdminVoid("ADMIN", async (admin) => {
    const id = str(fd, "id", 40);
    const dir = str(fd, "dir", 4) === "up" ? -1 : 1;
    const list = await db.product.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, name: true } });
    const i = list.findIndex((p) => p.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    await db.$transaction(list.map((p, idx) => db.product.update({ where: { id: p.id }, data: { sortOrder: idx + 1 } })));
    await audit(admin.id, "product_reordered", "product", id, { summary: `Ordem alterada: ${list[j].name}` });
    refreshStore("catalog", "landing");
    revalidatePath("/admin/produtos");
  });
}

export async function deleteProduct(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return withAdmin("ADMIN", async (admin) => {
    const id = str(fd, "id", 40);
    const p = await db.product.findUniqueOrThrow({ where: { id }, include: { _count: { select: { orderBumps: true, upsells: true, orderItems: true } } } });
    if (p._count.orderBumps || p._count.upsells) return { error: "Este produto é usado em order bumps/upsells. Remova-os antes ou desative o produto." };
    if (str(fd, "confirm", 20).toUpperCase() !== "EXCLUIR") return { error: 'Digite "EXCLUIR" para confirmar.' };
    await db.product.delete({ where: { id } });
    await audit(admin.id, "product_deleted", "product", id, { summary: `Produto excluído: ${p.name} (${p._count.orderItems} item(ns) de pedido preservados no histórico)` });
    refreshStore("catalog", "landing");
    redirect("/admin/produtos");
  });
}
