import "server-only";
import type { Coupon, Product } from "@prisma/client";
import { db } from "@/lib/db";
import { priceOverrides, valueFor, type Assignment } from "@/lib/experiments";
import { computeTotals, couponDiscount, effectivePrice } from "@/lib/pricing";
import { assignmentsFor, isSellable, toPublicProduct } from "@/server/catalog";
import type { CartQuote, QuoteBump, QuoteLine } from "@/types/catalog";

export type CartItemInput = { productId: string; quantity: number; source?: "cross_sell" | null };
export type QuoteInput = { items: CartItemInput[]; bumpIds?: string[]; couponCode?: string | null; visitorId?: string | null };

const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export type CouponCheck = { coupon: Coupon | null; message: string | null };

/** Valida um cupom no momento da compra (janela, limite de usos, ativo). */
export async function findValidCoupon(code: string | null | undefined, now = new Date()): Promise<CouponCheck> {
  const normalized = code?.trim().toUpperCase();
  if (!normalized) return { coupon: null, message: null };
  const coupon = await db.coupon.findUnique({ where: { code: normalized } });
  if (!coupon || !coupon.active) return { coupon: null, message: "Cupom inválido." };
  if (coupon.startsAt && now < coupon.startsAt) return { coupon: null, message: "Este cupom ainda não está válido." };
  if (coupon.endsAt && now >= coupon.endsAt) return { coupon: null, message: "Este cupom expirou." };
  if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) return { coupon: null, message: "Este cupom atingiu o limite de usos." };
  return { coupon, message: null };
}

export type FullQuote = CartQuote & {
  assignments: Assignment[];
  couponRow: Coupon | null;
  productsById: Map<string, Product>;
  bumpRows: { id: string; productId: string; priceCents: number }[];
};

/**
 * Orçamento do carrinho calculado 100% no servidor: preços atuais do banco,
 * promoções vigentes, testes de preço, bumps elegíveis, cross-sell e cupom.
 * O checkout usa exatamente a mesma função — o navegador nunca define preço.
 */
export async function quoteCart(input: QuoteInput): Promise<FullQuote> {
  const assignments = await assignmentsFor(input.visitorId);
  const overrides = priceOverrides(assignments);

  const requested = new Map<string, CartItemInput>();
  for (const it of input.items.slice(0, 20)) {
    const prev = requested.get(it.productId);
    requested.set(it.productId, { ...it, quantity: Math.min(10, (prev?.quantity ?? 0) + Math.max(1, Math.floor(it.quantity))) });
  }

  const products = await db.product.findMany({ where: { id: { in: [...requested.keys()] } } });
  const productsById = new Map(products.map((p) => [p.id, p]));
  const removed: string[] = [];
  const lines: QuoteLine[] = [];

  for (const item of requested.values()) {
    const p = productsById.get(item.productId);
    if (!p || !isSellable(p)) {
      removed.push(p?.name ?? item.productId);
      continue;
    }
    const price = effectivePrice(p, overrides);
    const quantity = 1; // produto digital: uma licença por pedido
    lines.push({
      productId: p.id,
      slug: p.slug,
      name: p.name,
      imageUrl: p.imageUrl,
      category: p.category,
      fulfillment: p.fulfillment,
      quantity,
      unitPriceCents: price.priceCents,
      listPriceCents: price.listPriceCents,
      totalCents: price.priceCents * quantity,
      kind: item.source === "cross_sell" ? "CROSS_SELL" : "PRODUCT",
    });
  }

  const inCart = new Set(lines.map((l) => l.productId));
  const included = new Set(lines.flatMap((l) => ids(productsById.get(l.productId)?.includedProductIds)));

  // ───── Order bumps elegíveis ─────
  const bumpCandidates = lines.length
    ? await db.orderBump.findMany({ where: { active: true }, include: { product: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] })
    : [];
  const forcedBump = valueFor(assignments, "order_bump");
  const seenBumpProducts = new Set<string>();
  const bumps: QuoteBump[] = [];
  const bumpRows: FullQuote["bumpRows"] = [];
  for (const b of bumpCandidates) {
    if (!isSellable(b.product) || inCart.has(b.productId) || included.has(b.productId) || seenBumpProducts.has(b.productId)) continue;
    const triggers = ids(b.triggerProductIds);
    if (triggers.length && !triggers.some((t) => inCart.has(t))) continue;
    if (forcedBump && b.id !== forcedBump) continue;
    seenBumpProducts.add(b.productId);
    const price = effectivePrice(b.product, overrides);
    const priceCents = b.priceCents && b.priceCents > 0 ? b.priceCents : price.priceCents;
    const reference = Math.max(price.priceCents, price.listPriceCents ?? 0);
    bumps.push({
      id: b.id,
      productId: b.productId,
      title: b.title,
      description: b.description,
      benefit: b.benefit,
      imageUrl: b.imageUrl ?? b.product.imageUrl,
      priceCents,
      listPriceCents: reference > priceCents ? reference : null,
      selected: Boolean(input.bumpIds?.includes(b.id)),
      showModal: b.showModal,
      modalTitle: b.modalTitle,
      productName: b.product.name,
      discountPct: reference > priceCents ? Math.round((1 - priceCents / reference) * 100) : null,
    });
    bumpRows.push({ id: b.id, productId: b.productId, priceCents });
    productsById.set(b.product.id, b.product);
  }
  for (const b of bumps.filter((x) => x.selected)) {
    const p = productsById.get(b.productId)!;
    lines.push({
      productId: p.id,
      slug: p.slug,
      name: p.name,
      imageUrl: b.imageUrl,
      category: p.category,
      fulfillment: p.fulfillment,
      quantity: 1,
      unitPriceCents: b.priceCents,
      listPriceCents: null,
      totalCents: b.priceCents,
      kind: "ORDER_BUMP",
      orderBumpId: b.id,
    });
  }

  // ───── Cross-sell: sugestões dos produtos no carrinho, sem repetir o que já está no pedido ─────
  const offered = new Set([...inCart, ...included, ...bumps.map((b) => b.productId)]);
  const crossIds = [...new Set(lines.flatMap((l) => ids(productsById.get(l.productId)?.crossSellIds)))].filter((id) => !offered.has(id));
  const crossRows = crossIds.length ? await db.product.findMany({ where: { id: { in: crossIds } } }) : [];
  const crossSells = crossIds
    .map((id) => crossRows.find((p) => p.id === id))
    .filter((p): p is Product => Boolean(p && isSellable(p)))
    .slice(0, 4)
    .map((p) => toPublicProduct(p, overrides));

  // ───── Cupom ─────
  const priced = lines.map((l) => ({ productId: l.productId, unitPriceCents: l.unitPriceCents, quantity: l.quantity }));
  let couponState: CartQuote["coupon"] = null;
  let discount = 0;
  let couponRow: Coupon | null = null;
  if (input.couponCode?.trim()) {
    const check = await findValidCoupon(input.couponCode);
    const code = input.couponCode.trim().toUpperCase();
    if (check.coupon) {
      discount = couponDiscount(priced, { type: check.coupon.type, value: check.coupon.value, minSubtotalCents: check.coupon.minSubtotalCents, productIds: ids(check.coupon.productIds) });
      if (discount > 0) {
        couponRow = check.coupon;
        couponState = { code, valid: true, message: null };
      } else {
        const min = check.coupon.minSubtotalCents;
        couponState = { code, valid: false, message: min ? "O pedido não atinge o valor mínimo deste cupom." : "Este cupom não se aplica aos produtos do carrinho." };
      }
    } else {
      couponState = { code, valid: false, message: check.message };
    }
  }

  const totals = computeTotals(priced, discount);

  return {
    lines,
    bumps,
    crossSells,
    ...totals,
    coupon: couponState,
    removed,
    assignments,
    couponRow,
    productsById,
    bumpRows,
  };
}

/** Versão pública (sem linhas internas) enviada ao navegador. */
export function publicQuote(q: FullQuote): CartQuote {
  return {
    lines: q.lines,
    bumps: q.bumps,
    crossSells: q.crossSells,
    subtotalCents: q.subtotalCents,
    discountCents: q.discountCents,
    totalCents: q.totalCents,
    coupon: q.coupon,
    removed: q.removed,
  };
}
