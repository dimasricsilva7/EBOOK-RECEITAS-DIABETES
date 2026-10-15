import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { FUNNEL_STEPS, PAID_STATUSES } from "@/lib/domain";
import { dayKeys, toDayKey, type Period } from "./period";

const PAID = [...PAID_STATUSES] as ("PAID" | "CREDIARIO_APROVADO")[];
const n = (v: unknown) => Number(v ?? 0);
const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);
const revenueOf = (o: { paidAmountCents: number | null; totalCents: number }) => o.paidAmountCents ?? o.totalCents;

// ───────────────────────── Dashboard ─────────────────────────

export async function dashboard(p: Period) {
  const range = { gte: p.from, lt: p.to };
  const [sessions, visitorsRow, ordersCreated, paidOrders, pendingPix, spend, bumpViews, upsellEvents, abandonRow, newCustomers, quizRow, stepRow] = await Promise.all([
    db.analyticsSession.count({ where: { firstSeenAt: range, NOT: { device: "servidor" } } }),
    db.$queryRaw<{ c: bigint }[]>`SELECT COUNT(DISTINCT "visitorId") c FROM "AnalyticsSession" WHERE "firstSeenAt" >= ${p.from} AND "firstSeenAt" < ${p.to} AND COALESCE(device,'') <> 'servidor'`,
    db.order.findMany({ where: { createdAt: range }, select: { id: true, status: true, source: true, transactionId: true, totalCents: true, items: { select: { kind: true } } } }),
    db.order.findMany({
      where: { paidAt: range, status: { in: PAID } },
      select: { id: true, source: true, paidAt: true, totalCents: true, paidAmountCents: true, channel: true, utmCampaign: true, device: true, customerId: true, paymentMethod: true, items: { select: { kind: true, productName: true, category: true, quantity: true, totalPriceCents: true } } },
    }),
    db.order.count({ where: { status: "PIX_GENERATED" } }),
    db.adSpend.aggregate({ where: { date: { gte: new Date(p.fromInput), lte: new Date(p.toInput) } }, _sum: { spendCents: true } }),
    db.$queryRaw<{ c: bigint }[]>`SELECT COUNT(DISTINCT "sessionId") c FROM "AnalyticsEvent" WHERE name='order_bump_view' AND "createdAt" >= ${p.from} AND "createdAt" < ${p.to}`,
    db.upsellEvent.groupBy({ by: ["action"], where: { createdAt: range }, _count: true }),
    // Abandono = sessões que iniciaram checkout e NÃO geraram PIX (mesma sessão)
    db.$queryRaw<{ started: bigint; pix: bigint }[]>`
      SELECT COUNT(*) started, COUNT(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM "AnalyticsEvent" x WHERE x."sessionId" = c."sessionId" AND x.name = 'pix_generated' AND x."createdAt" >= c.first)) pix
      FROM (SELECT "sessionId", MIN("createdAt") first FROM "AnalyticsEvent" WHERE name = 'checkout_started' AND "createdAt" >= ${p.from} AND "createdAt" < ${p.to} GROUP BY 1) c`,
    db.$queryRaw<{ c: bigint }[]>`
      SELECT COUNT(*) c FROM (SELECT "customerId", MIN("paidAt") first FROM "Order" WHERE "paidAt" IS NOT NULL GROUP BY "customerId") t
      WHERE t.first >= ${p.from} AND t.first < ${p.to}`,
    db.$queryRaw<{ started: bigint; completed: bigint; leads: bigint; offer: bigint; checkout: bigint; purchased: bigint }[]>`
      SELECT COUNT(*) FILTER (WHERE "consentAt" IS NOT NULL) started, COUNT(*) FILTER (WHERE "completedAt" IS NOT NULL) completed,
             COUNT(*) FILTER (WHERE "identifiedAt" IS NOT NULL) leads, COUNT(*) FILTER (WHERE "offerViewedAt" IS NOT NULL) offer,
             COUNT(*) FILTER (WHERE "checkoutStartedAt" IS NOT NULL) checkout, COUNT(*) FILTER (WHERE "purchasedAt" IS NOT NULL) purchased
      FROM "QuizSession" WHERE "startedAt" >= ${p.from} AND "startedAt" < ${p.to}`,
    db.$queryRaw<{ landing: bigint; offer: bigint; checkout: bigint }[]>`
      SELECT COUNT(DISTINCT "sessionId") FILTER (WHERE name = 'landing_view') landing, COUNT(DISTINCT "sessionId") FILTER (WHERE name = 'offer_view') offer,
             COUNT(DISTINCT "sessionId") FILTER (WHERE name = 'checkout_started') checkout
      FROM "AnalyticsEvent" WHERE "createdAt" >= ${p.from} AND "createdAt" < ${p.to}`,
  ]);

  const visitors = n(visitorsRow[0]?.c);
  const revenue = paidOrders.reduce((s, o) => s + revenueOf(o), 0);
  const paidMain = paidOrders.filter((o) => o.source === "STOREFRONT");
  const storefront = ordersCreated.filter((o) => o.source === "STOREFRONT");
  const pixGenerated = ordersCreated.filter((o) => o.transactionId).length;
  const withBump = storefront.filter((o) => o.transactionId && o.items.some((i) => i.kind === "ORDER_BUMP")).length;
  const upView = upsellEvents.find((u) => u.action === "VIEW")?._count ?? 0;
  const upAccept = upsellEvents.find((u) => u.action === "ACCEPT")?._count ?? 0;
  const spendCents = spend._sum.spendCents ?? 0;
  const started = n(abandonRow[0]?.started);
  const pixSessions = n(abandonRow[0]?.pix);
  const expiredOrPending = ordersCreated.filter((o) => ["EXPIRED", "PIX_GENERATED"].includes(o.status)).length;

  // Série diária
  const byDay = new Map(dayKeys(p).map((d) => [d, { revenue: 0, orders: 0 }]));
  for (const o of paidOrders) {
    const k = toDayKey(o.paidAt!);
    const row = byDay.get(k);
    if (row) {
      row.revenue += revenueOf(o);
      row.orders += 1;
    }
  }

  const group = (key: (o: (typeof paidOrders)[number]) => string) => {
    const m = new Map<string, { value: number; count: number }>();
    for (const o of paidOrders) {
      const k = key(o) || "—";
      const r = m.get(k) ?? { value: 0, count: 0 };
      r.value += revenueOf(o);
      r.count += 1;
      m.set(k, r);
    }
    return [...m.entries()].map(([label, r]) => ({ label, value: r.value, sub: `${r.count} pedido(s)` })).sort((a, b) => b.value - a.value);
  };
  const kitMap = new Map<string, { value: number; units: number }>();
  for (const o of paidOrders) for (const i of o.items) {
    const r = kitMap.get(i.productName) ?? { value: 0, units: 0 };
    r.value += i.totalPriceCents;
    r.units += i.quantity;
    kitMap.set(i.productName, r);
  }

  const q = quizRow[0] ?? {};
  const st = stepRow[0] ?? {};
  const bumpRevenue = paidOrders.reduce((sum, o) => sum + o.items.filter((i) => i.kind === "ORDER_BUMP").reduce((a, i) => a + i.totalPriceCents, 0), 0);
  const upsellRevenue = paidOrders.filter((o) => o.source === "UPSELL").reduce((sum, o) => sum + revenueOf(o), 0);
  const landingSessions = n(st.landing);
  const checkoutSessions = n(st.checkout);

  return {
    revenue,
    orders: ordersCreated.length,
    quiz: { started: n(q.started), completed: n(q.completed), leads: n(q.leads), offer: n(q.offer), checkout: n(q.checkout), purchased: n(q.purchased), completionRate: ratio(n(q.completed), n(q.started)) },
    offerViews: n(st.offer),
    checkoutsStarted: checkoutSessions,
    landingConversion: ratio(paidMain.length, landingSessions),
    checkoutConversion: ratio(paidMain.length, checkoutSessions),
    bumpRevenue,
    upsellRevenue,
    extraRevenue: bumpRevenue + upsellRevenue,
    crediarioPaid: paidOrders.filter((o) => o.paymentMethod === "CREDIARIO").length,
    paidOrders: paidOrders.length,
    pendingPix,
    pixGenerated,
    pixPaid: paidOrders.length,
    aov: ratio(revenue, paidOrders.length),
    visitors,
    sessions,
    conversion: ratio(paidMain.length, visitors),
    revenuePerVisitor: ratio(revenue, visitors),
    // Principal: pedidos com bump ÷ pedidos com PIX (fonte: banco). Secundário: ÷ sessões que viram o bump.
    bumpRate: ratio(withBump, storefront.filter((o) => o.transactionId).length),
    bumpViewRate: Math.min(1, ratio(withBump, n(bumpViews[0]?.c))),
    upsellRate: ratio(upAccept, upView),
    checkoutAbandonment: started ? 1 - ratio(pixSessions, started) : 0,
    pixPaymentRate: ratio(paidMain.length, pixGenerated),
    unpaidPix: expiredOrPending,
    spendCents,
    cac: ratio(spendCents, n(newCustomers[0]?.c)),
    cpa: ratio(spendCents, paidOrders.length),
    roas: ratio(revenue, spendCents),
    daily: [...byDay.entries()].map(([day, r]) => ({ day, values: [r.revenue] })),
    dailyOrders: [...byDay.entries()].map(([day, r]) => ({ day, values: [r.orders] })),
    byKit: [...kitMap.entries()].map(([label, r]) => ({ label, value: r.value, sub: `${r.units} un.` })).sort((a, b) => b.value - a.value),
    byChannel: group((o) => o.channel ?? "direto"),
    byCampaign: group((o) => o.utmCampaign ?? "(sem campanha)").slice(0, 10),
    byDevice: group((o) => o.device ?? "—"),
  };
}

// ───────────────────────── Funil ─────────────────────────

export type FunnelFilters = { productId?: string; source?: string; campaign?: string; device?: string };

function sessionFilter(f: FunnelFilters, p: Period) {
  const parts: Prisma.Sql[] = [];
  if (f.source) parts.push(Prisma.sql`(s."utmSource" = ${f.source} OR s.channel = ${f.source})`);
  if (f.campaign) parts.push(Prisma.sql`s."utmCampaign" = ${f.campaign}`);
  if (f.device) parts.push(Prisma.sql`s.device = ${f.device}`);
  if (f.productId)
    parts.push(Prisma.sql`e."sessionId" IN (SELECT "sessionId" FROM "AnalyticsEvent" WHERE "productId" = ${f.productId} AND "createdAt" >= ${p.from} AND "createdAt" < ${p.to})`);
  return parts.length ? Prisma.sql`AND ${Prisma.join(parts, " AND ")}` : Prisma.empty;
}

export async function funnel(p: Period, f: FunnelFilters = {}) {
  const cols = FUNNEL_STEPS.map((s, i) => Prisma.sql`COUNT(DISTINCT e."sessionId") FILTER (WHERE e.name IN (${Prisma.join(s.events)})) AS ${Prisma.raw(`s${i}`)}`);
  const rows = await db.$queryRaw<Record<string, bigint>[]>`
    SELECT ${Prisma.join(cols)},
           COALESCE(SUM(e."valueCents") FILTER (WHERE e.name = 'purchase'), 0) AS revenue
    FROM "AnalyticsEvent" e JOIN "AnalyticsSession" s ON s.id = e."sessionId"
    WHERE e."createdAt" >= ${p.from} AND e."createdAt" < ${p.to} ${sessionFilter(f, p)}`;
  const r = rows[0] ?? {};
  const steps = FUNNEL_STEPS.map((s, i) => ({ key: s.key, label: s.label, value: n(r[`s${i}`]) }));
  const first = steps[0]?.value ?? 0;
  return {
    steps: steps.map((s, i) => ({ ...s, pctOfFirst: ratio(s.value, first), dropFromPrev: i ? 1 - ratio(s.value, steps[i - 1].value) : 0 })),
    revenue: n(r.revenue),
    conversion: ratio(steps.at(-1)?.value ?? 0, first),
  };
}

/** Mesmo funil, quebrado por dia (fuso de São Paulo) — para comparar o tráfego de cada dia. */
export async function funnelByDay(p: Period, f: FunnelFilters = {}) {
  const cols = FUNNEL_STEPS.map((s, i) => Prisma.sql`COUNT(DISTINCT e."sessionId") FILTER (WHERE e.name IN (${Prisma.join(s.events)})) AS ${Prisma.raw(`s${i}`)}`);
  const rows = await db.$queryRaw<Record<string, bigint | string>[]>`
    SELECT to_char(e."createdAt" - interval '3 hours', 'YYYY-MM-DD') AS day, ${Prisma.join(cols)},
           COALESCE(SUM(e."valueCents") FILTER (WHERE e.name = 'purchase'), 0) AS revenue
    FROM "AnalyticsEvent" e JOIN "AnalyticsSession" s ON s.id = e."sessionId"
    WHERE e."createdAt" >= ${p.from} AND e."createdAt" < ${p.to} ${sessionFilter(f, p)}
    GROUP BY 1`;
  const byDay = new Map(rows.map((r) => [String(r.day), r]));
  return dayKeys(p)
    .reverse()
    .map((day) => {
      const r = byDay.get(day) ?? {};
      const values = FUNNEL_STEPS.map((_, i) => n(r[`s${i}`] as bigint | undefined));
      return { day, values, revenue: n(r.revenue as bigint | undefined), conversion: ratio(values.at(-1) ?? 0, values[0] ?? 0) };
    });
}

export async function funnelFilterOptions() {
  const [sources, campaigns, devices, products] = await Promise.all([
    db.analyticsSession.findMany({ where: { utmSource: { not: null } }, distinct: ["utmSource"], select: { utmSource: true }, take: 50 }),
    db.analyticsSession.findMany({ where: { utmCampaign: { not: null } }, distinct: ["utmCampaign"], select: { utmCampaign: true }, take: 100 }),
    db.analyticsSession.findMany({ where: { device: { not: null } }, distinct: ["device"], select: { device: true } }),
    db.product.findMany({ select: { id: true, name: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  return {
    sources: [...new Set(["facebook", "instagram", "google", "tiktok", ...sources.map((s) => s.utmSource!)])],
    campaigns: campaigns.map((c) => c.utmCampaign!),
    devices: devices.map((d) => d.device!).filter((d) => d !== "servidor"),
    products,
  };
}

// ───────────────────────── Aquisição ─────────────────────────

export const ACQ_DIMS = {
  utmSource: "UTM Source",
  utmMedium: "UTM Medium",
  utmCampaign: "UTM Campaign",
  utmContent: "UTM Content",
  utmTerm: "UTM Term",
  channel: "Canal",
  fbclid: "fbclid",
  gclid: "gclid",
  ttclid: "ttclid",
} as const;
export type AcqDim = keyof typeof ACQ_DIMS;

export async function acquisition(p: Period, dim: AcqDim) {
  const clickId = dim === "fbclid" || dim === "gclid" || dim === "ttclid";
  const col = Prisma.raw(`"${dim}"`);
  const keyExpr = clickId ? Prisma.sql`CASE WHEN ${col} IS NULL THEN 'sem ${Prisma.raw(dim)}' ELSE 'com ${Prisma.raw(dim)}' END` : Prisma.sql`COALESCE(${col}, '(não definido)')`;
  const [sess, ords, spend] = await Promise.all([
    db.$queryRaw<{ k: string; sessions: bigint; visitors: bigint }[]>`
      SELECT ${keyExpr} k, COUNT(*) sessions, COUNT(DISTINCT "visitorId") visitors FROM "AnalyticsSession"
      WHERE "firstSeenAt" >= ${p.from} AND "firstSeenAt" < ${p.to} AND COALESCE(device,'') <> 'servidor' GROUP BY 1`,
    db.$queryRaw<{ k: string; orders: bigint; paid: bigint; revenue: bigint }[]>`
      SELECT ${keyExpr} k, COUNT(*) FILTER (WHERE "createdAt" >= ${p.from} AND "createdAt" < ${p.to}) orders,
             COUNT(*) FILTER (WHERE "paidAt" >= ${p.from} AND "paidAt" < ${p.to} AND status IN ('PAID','CREDIARIO_APROVADO')) paid,
             COALESCE(SUM(COALESCE("paidAmountCents","totalCents")) FILTER (WHERE "paidAt" >= ${p.from} AND "paidAt" < ${p.to} AND status IN ('PAID','CREDIARIO_APROVADO')),0) revenue
      FROM "Order" WHERE ("createdAt" >= ${p.from} AND "createdAt" < ${p.to}) OR ("paidAt" >= ${p.from} AND "paidAt" < ${p.to}) GROUP BY 1`,
    dim === "utmSource" || dim === "utmCampaign" || dim === "channel"
      ? db.adSpend.groupBy({ by: [dim === "utmCampaign" ? "campaign" : "source"], where: { date: { gte: new Date(p.fromInput), lte: new Date(p.toInput) } }, _sum: { spendCents: true } })
      : Promise.resolve([]),
  ]);
  const keys = new Set([...sess.map((s) => s.k), ...ords.map((o) => o.k)]);
  const spendMap = new Map<string, number>();
  for (const s of spend as { source?: string; campaign?: string | null; _sum: { spendCents: number | null } }[]) {
    const k = (s.campaign ?? s.source ?? "").toLowerCase();
    spendMap.set(k, (spendMap.get(k) ?? 0) + (s._sum.spendCents ?? 0));
  }
  return [...keys]
    .map((k) => {
      const s = sess.find((x) => x.k === k);
      const o = ords.find((x) => x.k === k);
      const visitors = n(s?.visitors);
      const paid = n(o?.paid);
      const revenue = n(o?.revenue);
      const spendCents = spendMap.get(k.toLowerCase()) ?? 0;
      return {
        key: k,
        sessions: n(s?.sessions),
        visitors,
        orders: n(o?.orders),
        paid,
        revenue,
        conversion: ratio(paid, visitors),
        aov: ratio(revenue, paid),
        spendCents,
        cpa: spendCents ? ratio(spendCents, paid) : null,
        roas: spendCents ? ratio(revenue, spendCents) : null,
      };
    })
    .sort((a, b) => b.revenue - a.revenue || b.sessions - a.sessions);
}

// ───────────────────────── Cliques ─────────────────────────

const ELEMENT_LABEL: Record<string, string> = {
  hero_cta: "Hero — CTA principal",
  hero_secondary: "Hero — link secundário",
  header_cta: "Cabeçalho — CTA",
  menu_cta: "Menu mobile — CTA",
  sticky_mobile_cta: "CTA fixo mobile",
  offer_cta: "Oferta — Comprar",
  final_cta: "CTA final",
  quiz_start: "Quiz — Começar",
  quiz_lead_submit: "Quiz — Enviar lead",
  quiz_result_cta: "Quiz — CTA do resultado",
  checkout_submit: "Checkout — Gerar PIX",
  method_pix: "Checkout — Escolheu PIX",
  method_crediario: "Checkout — Escolheu crediário",
  bump_modal_accept: "Modal do bump — Aceitar",
  bump_modal_reject: "Modal do bump — Recusar",
  pix_copy: "PIX — Copiar",
  pix_renew: "PIX — Gerar novo",
  upsell_accept: "Upsell — Aceitar",
  upsell_reject: "Upsell — Recusar",
  material_open: "Área de acesso — Abrir material",
};

export async function clicks(p: Period) {
  const rows = await db.$queryRaw<{ element: string; clicks: bigint; users: bigint; conv: bigint }[]>`
    WITH c AS (SELECT element, "sessionId" FROM "AnalyticsEvent" WHERE name = 'cta_click' AND element IS NOT NULL AND "createdAt" >= ${p.from} AND "createdAt" < ${p.to}),
         pur AS (SELECT DISTINCT "sessionId" FROM "AnalyticsEvent" WHERE name = 'purchase' AND "createdAt" >= ${p.from})
    SELECT c.element, COUNT(*) clicks, COUNT(DISTINCT c."sessionId") users, COUNT(DISTINCT c."sessionId") FILTER (WHERE pur."sessionId" IS NOT NULL) conv
    FROM c LEFT JOIN pur ON pur."sessionId" = c."sessionId" GROUP BY c.element ORDER BY clicks DESC`;
  const products = await db.product.findMany({ select: { slug: true, name: true } });
  const bumps = await db.orderBump.findMany({ select: { id: true, name: true } });
  const label = (el: string) => {
    if (ELEMENT_LABEL[el]) return ELEMENT_LABEL[el];
    const slug = el.replace(/^(kit_|store_|pdp_cross_|pdp_|complete_kit_)/, "");
    const prod = products.find((x) => x.slug === slug);
    if (prod) return `${el.startsWith("kit_") ? "Card do kit" : el.startsWith("complete_kit_") ? "Complete seu kit" : el.startsWith("store_") ? "Loja" : "Página do produto"} — ${prod.name}`;
    const bump = bumps.find((b) => el === `order_bump_${b.id}`);
    if (bump) return `Order bump — ${bump.name}`;
    return el;
  };
  return rows.map((r) => ({ element: r.element, label: label(r.element), clicks: n(r.clicks), users: n(r.users), conversions: n(r.conv), rate: ratio(n(r.conv), n(r.users)) }));
}

// ───────────────────────── Produtos e preço ─────────────────────────

export async function productStats(p: Period) {
  const [events, items, products] = await Promise.all([
    db.$queryRaw<{ productId: string; views: bigint; clicks: bigint; carts: bigint }[]>`
      SELECT "productId", COUNT(DISTINCT "sessionId") FILTER (WHERE name='product_view') views,
             COUNT(*) FILTER (WHERE name IN ('cta_click','kit_selected')) clicks,
             COUNT(*) FILTER (WHERE name='add_to_cart') carts
      FROM "AnalyticsEvent" WHERE "productId" IS NOT NULL AND "createdAt" >= ${p.from} AND "createdAt" < ${p.to} GROUP BY "productId"`,
    db.orderItem.findMany({
      where: { order: { OR: [{ createdAt: { gte: p.from, lt: p.to } }, { paidAt: { gte: p.from, lt: p.to } }] } },
      select: { productId: true, quantity: true, totalPriceCents: true, order: { select: { id: true, status: true, createdAt: true, paidAt: true } } },
    }),
    db.product.findMany({ select: { id: true, name: true, category: true, priceCents: true, active: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  const inRange = (d: Date | null) => Boolean(d && d >= p.from && d < p.to);
  return products
    .map((prod) => {
      const e = events.find((x) => x.productId === prod.id);
      const its = items.filter((i) => i.productId === prod.id);
      const checkoutOrders = new Set(its.filter((i) => inRange(i.order.createdAt)).map((i) => i.order.id));
      const paidItems = its.filter((i) => inRange(i.order.paidAt) && (PAID as string[]).includes(i.order.status));
      const purchases = new Set(paidItems.map((i) => i.order.id)).size;
      const views = n(e?.views);
      return {
        id: prod.id,
        name: prod.name,
        category: prod.category,
        active: prod.active,
        priceCents: prod.priceCents,
        views,
        clicks: n(e?.clicks),
        carts: n(e?.carts),
        checkouts: checkoutOrders.size,
        purchases,
        units: paidItems.reduce((s, i) => s + i.quantity, 0),
        revenue: paidItems.reduce((s, i) => s + i.totalPriceCents, 0),
        conversion: ratio(purchases, views),
      };
    })
    .filter((r) => r.active || r.views || r.purchases);
}

/**
 * Análise de preço: para cada produto, janelas de preço (histórico de alterações)
 * × sessões que viram o produto × pedidos pagos com o preço aplicado no pedido.
 */
export async function priceAnalysis(p: Period) {
  const [history, products] = await Promise.all([
    db.priceHistory.findMany({ orderBy: { createdAt: "asc" } }),
    db.product.findMany({ select: { id: true, name: true, priceCents: true, createdAt: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  const out: { product: string; priceCents: number; from: Date; to: Date; viewSessions: number; orders: number; units: number; revenue: number; conversion: number; current: boolean }[] = [];
  for (const prod of products) {
    const h = history.filter((x) => x.productId === prod.id);
    const windows: { price: number; from: Date; to: Date; current: boolean }[] = [];
    let start = prod.createdAt;
    let price = h[0]?.oldPriceCents ?? prod.priceCents;
    for (const change of h) {
      windows.push({ price, from: start, to: change.createdAt, current: false });
      start = change.createdAt;
      price = change.newPriceCents;
    }
    windows.push({ price, from: start, to: new Date(), current: true });
    for (const w of windows) {
      const from = new Date(Math.max(w.from.getTime(), p.from.getTime()));
      const to = new Date(Math.min(w.to.getTime(), p.to.getTime()));
      if (from >= to) continue;
      const [views, sold] = await Promise.all([
        db.$queryRaw<{ c: bigint }[]>`SELECT COUNT(DISTINCT "sessionId") c FROM "AnalyticsEvent" WHERE name='product_view' AND "productId"=${prod.id} AND "createdAt" >= ${from} AND "createdAt" < ${to}`,
        db.orderItem.findMany({ where: { productId: prod.id, kind: "PRODUCT", order: { status: { in: PAID }, createdAt: { gte: from, lt: to } } }, select: { orderId: true, quantity: true, totalPriceCents: true } }),
      ]);
      const orders = new Set(sold.map((s) => s.orderId)).size;
      out.push({
        product: prod.name,
        priceCents: w.price,
        from,
        to,
        viewSessions: n(views[0]?.c),
        orders,
        units: sold.reduce((s, x) => s + x.quantity, 0),
        revenue: sold.reduce((s, x) => s + x.totalPriceCents, 0),
        conversion: ratio(orders, n(views[0]?.c)),
        current: w.current,
      });
    }
  }
  // Vendas por preço efetivamente aplicado (inclui promoções, cupons e testes A/B)
  const applied = await db.$queryRaw<{ product: string; price: number; orders: bigint; units: bigint; revenue: bigint }[]>`
    SELECT i."productName" product, i."unitPriceCents" price, COUNT(DISTINCT i."orderId") orders, SUM(i.quantity) units, SUM(i."totalPriceCents") revenue
    FROM "OrderItem" i JOIN "Order" o ON o.id = i."orderId"
    WHERE i.kind = 'PRODUCT' AND o.status IN ('PAID','CREDIARIO_APROVADO') AND o."paidAt" >= ${p.from} AND o."paidAt" < ${p.to}
    GROUP BY 1, 2 ORDER BY 1, 2`;
  return { windows: out, applied: applied.map((a) => ({ product: a.product, priceCents: n(a.price), orders: n(a.orders), units: n(a.units), revenue: n(a.revenue) })) };
}

// ───────────────────────── Ofertas ─────────────────────────

export async function bumpReport(p: Period) {
  const [bumps, events, items] = await Promise.all([
    db.orderBump.findMany({ include: { product: { select: { name: true } } }, orderBy: { sortOrder: "asc" } }),
    db.$queryRaw<{ bump: string; views: bigint; accepts: bigint; rejects: bigint }[]>`
      SELECT props->>'bumpId' bump, COUNT(DISTINCT "sessionId") FILTER (WHERE name='order_bump_view') views,
             COUNT(*) FILTER (WHERE name='order_bump_accept') accepts, COUNT(*) FILTER (WHERE name='order_bump_reject') rejects
      FROM "AnalyticsEvent" WHERE name IN ('order_bump_view','order_bump_accept','order_bump_reject') AND "createdAt" >= ${p.from} AND "createdAt" < ${p.to} GROUP BY 1`,
    db.orderItem.findMany({ where: { kind: "ORDER_BUMP", order: { createdAt: { gte: p.from, lt: p.to } } }, select: { orderBumpId: true, totalPriceCents: true, order: { select: { status: true } } } }),
  ]);
  return bumps.map((b) => {
    const e = events.find((x) => x.bump === b.id);
    const its = items.filter((i) => i.orderBumpId === b.id);
    const paid = its.filter((i) => (PAID as string[]).includes(i.order.status));
    const views = n(e?.views);
    return { id: b.id, name: b.name, product: b.product.name, active: b.active, views, accepts: n(e?.accepts), rejects: n(e?.rejects), inOrders: its.length, paid: paid.length, revenue: paid.reduce((s, i) => s + i.totalPriceCents, 0), rate: ratio(its.length, views) };
  });
}

export async function upsellReport(p: Period) {
  const [ups, events, children] = await Promise.all([
    db.upsell.findMany({ include: { product: { select: { name: true } } }, orderBy: { sortOrder: "asc" } }),
    db.upsellEvent.groupBy({ by: ["upsellId", "action"], where: { createdAt: { gte: p.from, lt: p.to } }, _count: true }),
    db.orderItem.findMany({ where: { kind: "UPSELL", order: { createdAt: { gte: p.from, lt: p.to } } }, select: { upsellId: true, totalPriceCents: true, order: { select: { status: true } } } }),
  ]);
  return ups.map((u) => {
    const c = (a: string) => events.find((e) => e.upsellId === u.id && e.action === a)?._count ?? 0;
    const its = children.filter((i) => i.upsellId === u.id);
    const paid = its.filter((i) => (PAID as string[]).includes(i.order.status));
    return { id: u.id, name: u.name, product: u.product.name, active: u.active, position: u.sortOrder, views: c("VIEW"), accepts: c("ACCEPT"), rejects: c("REJECT"), paid: paid.length, revenue: paid.reduce((s, i) => s + i.totalPriceCents, 0), rate: ratio(c("ACCEPT"), c("VIEW")) };
  });
}

export async function downsellReport(p: Period) {
  const [downs, events] = await Promise.all([
    db.downsell.findMany({ include: { product: { select: { name: true } }, upsell: { select: { name: true } } }, orderBy: { createdAt: "asc" } }),
    db.downsellEvent.findMany({ where: { createdAt: { gte: p.from, lt: p.to } }, select: { downsellId: true, action: true, childOrderId: true } }),
  ]);
  const childIds = events.filter((e) => e.action === "ACCEPT" && e.childOrderId).map((e) => e.childOrderId!);
  const paidChildren = childIds.length ? await db.order.findMany({ where: { id: { in: childIds }, status: { in: PAID } }, select: { id: true, totalCents: true, paidAmountCents: true } }) : [];
  const paidMap = new Map(paidChildren.map((o) => [o.id, revenueOf(o)]));
  return downs.map((d) => {
    const ev = events.filter((e) => e.downsellId === d.id);
    const count = (a: string) => ev.filter((e) => e.action === a).length;
    const paid = ev.filter((e) => e.action === "ACCEPT" && e.childOrderId && paidMap.has(e.childOrderId));
    return {
      id: d.id,
      name: d.name,
      product: d.product.name,
      upsell: d.upsell.name,
      active: d.active,
      views: count("VIEW"),
      accepts: count("ACCEPT"),
      rejects: count("REJECT"),
      paid: paid.length,
      revenue: paid.reduce((s, e) => s + (paidMap.get(e.childOrderId!) ?? 0), 0),
      rate: ratio(count("ACCEPT"), count("VIEW")),
    };
  });
}

// ───────────────────────── PIX pendentes ─────────────────────────

export async function pendingPix(includeExpired: boolean) {
  return db.order.findMany({
    where: includeExpired ? { status: { in: ["PIX_GENERATED", "EXPIRED"] }, createdAt: { gte: new Date(Date.now() - 14 * 86_400_000) } } : { status: "PIX_GENERATED" },
    include: { customer: true, items: { select: { productName: true, quantity: true, kind: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

// ───────────────────────── Comportamento na página ─────────────────────────

/** Profundidade de rolagem na página inicial + onde os visitantes saem do site. */
export async function behavior(p: Period) {
  // Só sessões que abriram a página inicial, e o que ELAS fizeram (subconjunto correto)
  const scroll = await db.$queryRaw<{ landing: bigint; s25: bigint; s50: bigint; s75: bigint; s90: bigint; kit: bigint; cart: bigint; checkout: bigint }[]>`
    WITH home AS (
      SELECT DISTINCT e."sessionId" AS sid
      FROM "AnalyticsEvent" e JOIN "AnalyticsSession" s ON s.id = e."sessionId"
      WHERE e.name = 'landing_view' AND e."createdAt" >= ${p.from} AND e."createdAt" < ${p.to} AND COALESCE(s.device,'') <> 'servidor'
    )
    SELECT
      (SELECT COUNT(*) FROM home) AS landing,
      COUNT(DISTINCT e."sessionId") FILTER (WHERE e.name = 'scroll_25') AS s25,
      COUNT(DISTINCT e."sessionId") FILTER (WHERE e.name = 'scroll_50') AS s50,
      COUNT(DISTINCT e."sessionId") FILTER (WHERE e.name = 'scroll_75') AS s75,
      COUNT(DISTINCT e."sessionId") FILTER (WHERE e.name = 'scroll_90') AS s90,
      COUNT(DISTINCT e."sessionId") FILTER (WHERE e.name = 'offer_view') AS kit,
      COUNT(DISTINCT e."sessionId") FILTER (WHERE e.name = 'add_to_cart') AS cart,
      COUNT(DISTINCT e."sessionId") FILTER (WHERE e.name = 'checkout_started') AS checkout
    FROM "AnalyticsEvent" e
    WHERE e."sessionId" IN (SELECT sid FROM home) AND e."createdAt" >= ${p.from} AND e."createdAt" < ${p.to}`;
  const r = scroll[0] ?? {};
  const landing = n(r.landing);
  const depth = [
    { label: "Abriu a página inicial", value: landing },
    { label: "Rolou 25%", value: n(r.s25) },
    { label: "Rolou 50% (meio da página)", value: n(r.s50) },
    { label: "Rolou 75%", value: n(r.s75) },
    { label: "Rolou 90% (quase o fim)", value: n(r.s90) },
    { label: "Viu a oferta", value: n(r.kit) },
    { label: "Clicou em comprar", value: n(r.cart) },
    { label: "Abriu o checkout", value: n(r.checkout) },
  ].map((d) => ({ ...d, pct: ratio(d.value, landing) }));

  // Onde os visitantes saíram (última página da sessão)
  const exits = await db.$queryRaw<{ page: string; sessions: bigint }[]>`
    SELECT COALESCE(NULLIF(split_part("exitPage", '?', 1), ''), '/') AS page, COUNT(*) AS sessions
    FROM "AnalyticsSession"
    WHERE "firstSeenAt" >= ${p.from} AND "firstSeenAt" < ${p.to} AND COALESCE(device,'') <> 'servidor'
    GROUP BY 1 ORDER BY 2 DESC LIMIT 12`;
  const totalSessions = exits.reduce((a, e) => a + n(e.sessions), 0);
  const label = (path: string) =>
    path === "/" ? "Página inicial" : path.startsWith("/quiz") ? "Quiz" : path.startsWith("/checkout") ? "Checkout" : path.startsWith("/pedido") ? "Página do pedido / acesso" : path.startsWith("/acesso") ? "Recuperar acesso" : path;
  const exitRows = exits.map((e) => ({ page: label(e.page), sessions: n(e.sessions), pct: ratio(n(e.sessions), totalSessions) }));

  return { depth, landing, exits: exitRows, totalSessions };
}
