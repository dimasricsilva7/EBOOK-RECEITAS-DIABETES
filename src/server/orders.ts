import "server-only";
import { Prisma, type Order, type OrderStatus, type PaymentStatus as DbPaymentStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { siteUrl } from "@/lib/env";
import { log } from "@/lib/log";
import { randomInt } from "crypto";
import { encryptField, hashIp, randomToken, safeEqual } from "@/lib/crypto";
import { paymentService, PaymentError, type PaymentSnapshot, type PaymentStatus } from "@/lib/payments";
import { assignmentMap } from "@/lib/experiments";
import { effectivePrice, formatOrderNumber, MIN_PIX_CENTS } from "@/lib/pricing";
import { isPaidStatus, CREDIARIO_TRANSITIONS, ORDER_STATUS_LABEL, type CrediarioStatus } from "@/lib/domain";
import { canTransition } from "@/lib/order-status";
import { classifyChannel, parseUserAgent } from "@/utils/channel";
import { linkSessionToCustomer, trackServerEvent } from "@/lib/analytics";
import { sendCapiEvent, fbcFromClickId } from "@/lib/meta/capi";
import { cancelScheduled, onOrderPaidEmail, onPixGeneratedEmail } from "@/lib/email";
import { quoteCart } from "@/server/cart";
import { crediarioConfig, installmentOptions, validateCrediario } from "@/lib/crediario";
import { linkLeadToOrder } from "@/server/checkout-leads";
import { isSellable, materialProductIds, readyMaterialCount } from "@/server/catalog";
import { linkQuizToOrder, markQuizPurchased } from "@/server/quiz";
import { getSettingsFresh, isOn, settingInt } from "@/server/settings";
import { isProductionDeploy } from "@/lib/env";
import type { CheckoutInput } from "@/lib/validation";
import type { ClientContext } from "@/types/tracking";
import type { PublicOrder, PublicUpsell } from "@/types/order";

export class CheckoutError extends Error {
  constructor(
    message: string,
    public status = 400,
    public fields?: Record<string, string>
  ) {
    super(message);
  }
}

const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
/** Transações interativas com folga para a latência do banco serverless. */
const TX_OPTS = { timeout: 15_000, maxWait: 10_000 };
const cut = (v: string | null | undefined, n = 200) => (v ? String(v).slice(0, n) : null);

// ───────────────────────── Linha do tempo do pedido ─────────────────────────

const SENSITIVE = /^(cpf|phone|document|customer|access_?token|authorization|api_?key|copy_?paste|pix)$/i;
function sanitize(data: unknown): Prisma.InputJsonValue | undefined {
  if (data == null) return undefined;
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, val]) => [k, SENSITIVE.test(k) ? "[redacted]" : walk(val)]));
    return v;
  };
  return walk(data) as Prisma.InputJsonValue;
}

export async function logOrderEvent(orderId: string | null, type: string, message: string, data?: unknown, status?: string) {
  await db.paymentEvent
    .create({ data: { orderId, type, message: message.slice(0, 500), status: status ?? null, data: sanitize(data) } })
    .catch((e) => log.error("order-event", "falha ao registrar", { type, error: e instanceof Error ? e.message : String(e) }));
}

// ───────────────────────── Checkout ─────────────────────────

/** Código aleatório de 5 dígitos (HB27684-2026), sem repetir números já usados. */
async function uniqueOrderNumber(tx: Prisma.TransactionClient, seq: number) {
  const year = new Date().getFullYear();
  for (let i = 0; i < 10; i++) {
    const candidate = formatOrderNumber(year, randomInt(10000, 100000));
    if (!(await tx.order.findUnique({ where: { orderNumber: candidate }, select: { id: true } }))) return candidate;
  }
  return formatOrderNumber(year, 100000 + seq);
}

export type RequestMeta = { ip: string; userAgent: string | null; host: string | null };

function attributionFields(ctx: ClientContext | undefined, host: string | null) {
  const a = ctx?.attribution ?? {};
  const first = a.first ?? null;
  const last = a.last ?? a.first ?? null;
  const channel = classifyChannel({ source: last?.source, medium: last?.medium, fbclid: a.fbclid, gclid: a.gclid, ttclid: a.ttclid, referrer: a.referrer, siteHost: host });
  return {
    utmSource: cut(last?.source),
    utmMedium: cut(last?.medium),
    utmCampaign: cut(last?.campaign),
    utmContent: cut(last?.content),
    utmTerm: cut(last?.term),
    firstTouchSource: cut(first?.source),
    firstTouchMedium: cut(first?.medium),
    firstTouchCampaign: cut(first?.campaign),
    firstTouchContent: cut(first?.content),
    firstTouchTerm: cut(first?.term),
    fbclid: cut(a.fbclid, 500),
    gclid: cut(a.gclid, 500),
    ttclid: cut(a.ttclid, 500),
    fbp: cut(ctx?.fbp),
    fbc: cut(ctx?.fbc, 500),
    landingPage: cut(a.landingPage, 500),
    referrer: cut(a.referrer, 500),
    sessionId: cut(ctx?.sessionId, 64),
    visitorId: cut(ctx?.visitorId, 64),
    adsConsent: Boolean(ctx?.adsConsent),
    channel,
  };
}

/**
 * Cria o pedido e gera o PIX. Idempotente por checkoutToken: duplo clique ou
 * retry de rede devolvem o mesmo pedido. Preços SEMPRE recalculados no servidor.
 */
export async function createCheckoutOrder(input: CheckoutInput, meta: RequestMeta) {
  const existing = await db.order.findUnique({ where: { checkoutToken: input.checkoutToken } });
  if (existing) {
    if (existing.pixCopyPaste || existing.status !== "PENDING") return { order: existing, reused: true };
    return { order: await ensurePix(existing.id), reused: true };
  }

  // Anti-abuso persistente (vale entre instâncias): impede gerar cobranças PIX em massa
  if (isProductionDeploy()) {
    const ipHash = hashIp(meta.ip);
    const [byIp, unpaidByEmail] = await Promise.all([
      ipHash ? db.order.count({ where: { ipHash, createdAt: { gte: new Date(Date.now() - 15 * 60_000) } } }) : 0,
      db.order.count({ where: { customer: { email: input.customer.email }, status: { in: ["PENDING", "PIX_GENERATED"] }, createdAt: { gte: new Date(Date.now() - 60 * 60_000) } } }),
    ]);
    if (byIp >= 8 || unpaidByEmail >= 5) {
      log.warn("checkout", "limite de pedidos atingido", { byIp, unpaidByEmail });
      throw new CheckoutError("Você já tem pedidos aguardando pagamento. Conclua um deles ou aguarde alguns minutos.", 429);
    }
  }

  const settings = await getSettingsFresh();
  if (!isOn(settings.sales_enabled)) throw new CheckoutError(settings.sales_closed_message || "As vendas ainda não estão abertas.", 503);
  const quote = await quoteCart({ items: input.items, bumpIds: input.bumpIds, couponCode: input.couponCode, visitorId: input.context?.visitorId });
  if (quote.removed.length) throw new CheckoutError(`Alguns itens não estão mais disponíveis: ${quote.removed.join(", ")}. Revise seu pedido.`, 409);
  if (!quote.lines.some((l) => l.kind !== "ORDER_BUMP")) throw new CheckoutError("Seu pedido está vazio.");
  // Nunca vende conteúdo que ainda não existe: cada produto do pedido precisa ter material pronto para entrega
  for (const l of quote.lines) {
    if ((await readyMaterialCount(l.productId)) === 0) throw new CheckoutError(`"${l.name}" ainda está em preparação e não pode ser comprado agora.`, 409);
  }
  if (input.couponCode && quote.coupon && !quote.coupon.valid) throw new CheckoutError(quote.coupon.message ?? "Cupom inválido.", 422, { couponCode: quote.coupon.message ?? "Cupom inválido" });
  if (quote.totalCents < MIN_PIX_CENTS) throw new CheckoutError("O valor mínimo do pedido é R$ 5,00.");

  if (isOn(settings.require_cpf) && !input.customer.cpf) throw new CheckoutError("Confira os dados informados.", 422, { "customer.cpf": "Informe seu CPF" });

  // Forma de pagamento: PIX (gateway) ou Crediário (protocolo próprio, análise manual)
  const method = input.paymentMethod ?? "PIX";
  if (method === "CREDIARIO" && !isOn(settings.crediario_enabled)) throw new CheckoutError("O crediário está indisponível no momento.", 503);
  const cfg = crediarioConfig(settings);
  let crediarioRow: Omit<Prisma.CrediarioDataUncheckedCreateInput, "orderId"> | null = null;
  if (method === "CREDIARIO") {
    const c = input.crediario;
    if (!c) throw new CheckoutError(cfg.errorMessage, 422, { "crediario.protocol": cfg.protocolError });
    const errs = validateCrediario(c, cfg);
    if (Object.keys(errs).length) throw new CheckoutError(cfg.errorMessage, 422, Object.fromEntries(Object.entries(errs).map(([k, v]) => [`crediario.${k}`, v])));
    const opt = installmentOptions(quote.totalCents, cfg).find((o) => o.n === c.installments) ?? installmentOptions(quote.totalCents, cfg)[0];
    crediarioRow = {
      protocolEnc: encryptField(c.protocol),
      protocolLast4: c.protocol.slice(-4),
      validityEnc: encryptField(c.validity.trim()),
      cpfLast3Enc: encryptField(c.cpfLast3),
      validityFormat: cfg.validityFormat,
      installments: opt.n,
      installmentCents: opt.cents,
      installmentLabel: opt.label,
      methodLabel: cfg.methodLabel,
    };
  }

  const attr = attributionFields(input.context, meta.host);
  const ua = parseUserAgent(meta.userAgent);
  const customerSnapshot = { name: input.customer.name, email: input.customer.email, phone: input.customer.phone, cpf: input.customer.cpf || null };
  const experiments = quote.assignments.length ? assignmentMap(quote.assignments) : null;

  let order: Order;
  try {
    order = await db.$transaction(async (tx) => {
      const customer = await tx.customer.upsert({
        where: { email: input.customer.email },
        update: { name: input.customer.name, phone: input.customer.phone, ...(input.customer.cpf ? { cpf: input.customer.cpf } : {}), ...(input.marketingConsent ? { marketingConsent: true } : {}) },
        create: { name: input.customer.name, email: input.customer.email, phone: input.customer.phone, cpf: input.customer.cpf || null, marketingConsent: input.marketingConsent },
      });
      const created = await tx.order.create({
        data: {
          customerId: customer.id,
          customerSnapshot,
          status: method === "CREDIARIO" ? "CREDIARIO_PENDENTE" : "PENDING",
          paymentMethod: method,
          paymentProvider: method === "PIX" ? "bravopay" : "crediario",
          ...(crediarioRow ? { crediario: { create: crediarioRow } } : {}),
          subtotalCents: quote.subtotalCents,
          discountCents: quote.discountCents,
          totalCents: quote.totalCents,
          couponId: quote.couponRow?.id ?? null,
          couponCode: quote.couponRow?.code ?? null,
          checkoutToken: input.checkoutToken,
          accessToken: randomToken(24),
          experiments: experiments ?? undefined,
          userAgent: cut(meta.userAgent, 300),
          device: ua.device,
          ipHash: hashIp(meta.ip),
          ...attr,
          items: {
            create: quote.lines.map((l) => {
              const p = quote.productsById.get(l.productId);
              return {
                kind: l.kind,
                productId: l.productId,
                productName: l.name,
                sku: p?.sku ?? l.slug,
                category: l.category,
                fulfillment: l.fulfillment,
                quantity: l.quantity,
                unitPriceCents: l.unitPriceCents,
                listPriceCents: p ? p.priceCents : l.unitPriceCents,
                totalPriceCents: l.totalCents,
                orderBumpId: l.orderBumpId ?? null,
              };
            }),
          },
        },
      });
      const orderNumber = await uniqueOrderNumber(tx, created.seq);
      return tx.order.update({ where: { id: created.id }, data: { orderNumber, externalReference: orderNumber, metaEventId: `purchase_${created.id}` } });
    }, TX_OPTS);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const again = await db.order.findUnique({ where: { checkoutToken: input.checkoutToken } });
      if (again) return { order: again, reused: true };
    }
    throw err;
  }

  await logOrderEvent(order.id, "order_created", `Pedido ${order.orderNumber} criado`, {
    total: order.totalCents,
    items: quote.lines.map((l) => `${l.quantity}x ${l.name} (${l.kind})`),
    coupon: order.couponCode,
    experiments,
  });
  log.info("checkout", "pedido criado", { order: order.orderNumber, total: order.totalCents, channel: order.channel });
  await linkLeadToOrder(input.leadKey, order.id, input.customer.email);
  await linkSessionToCustomer(order.sessionId, order.customerId);
  await linkQuizToOrder(input.quizSessionId, order.id).catch((e) => log.error("quiz", "falha ao ligar quiz ao pedido", { error: e instanceof Error ? e.message : String(e) }));

  const main = quote.lines.find((l) => l.kind !== "ORDER_BUMP");
  if (method === "CREDIARIO") {
    await logOrderEvent(order.id, "crediario_pending", `Pedido no crediário (${crediarioRow!.installmentLabel}) — aguardando análise`, { installments: crediarioRow!.installments, protocolLast4: crediarioRow!.protocolLast4 }, "CREDIARIO_PENDENTE");
    await trackServerEvent(order, "crediario_order_created", { valueCents: order.totalCents, productId: main?.productId });
    await trackServerEvent(order, "crediario_pending", { valueCents: order.totalCents, productId: main?.productId });
  }

  const withPix = method === "PIX" ? await ensurePix(order.id) : order;

  // Meta: AddPaymentInfo (mesmo event_id do navegador → deduplicação). Crediário também conta.
  if ((method === "CREDIARIO" || withPix.pixCopyPaste) && input.paymentEventId && order.adsConsent) {
    const [firstName, ...rest] = input.customer.name.split(/\s+/);
    await sendCapiEvent({
      eventName: "AddPaymentInfo",
      eventId: input.paymentEventId,
      eventSourceUrl: `${siteUrl()}/checkout`,
      user: {
        email: input.customer.email,
        phone: input.customer.phone,
        firstName,
        lastName: rest.at(-1),
        externalId: order.customerId,
        ip: meta.ip,
        userAgent: meta.userAgent,
        fbc: order.fbc ?? fbcFromClickId(order.fbclid, order.createdAt),
        fbp: order.fbp,
      },
      customData: {
        currency: "BRL",
        value: order.totalCents / 100,
        content_type: "product",
        content_ids: quote.lines.map((l) => quote.productsById.get(l.productId)?.sku ?? l.productId),
        contents: quote.lines.map((l) => ({ id: quote.productsById.get(l.productId)?.sku ?? l.productId, quantity: l.quantity, item_price: l.unitPriceCents / 100 })),
      },
    });
  }
  return { order: withPix, reused: false };
}

/** Gera o PIX no gateway se o pedido ainda não tiver um. Seguro para chamar de novo. */
export async function ensurePix(orderId: string): Promise<Order> {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { customer: true, items: true } });
  if (order.pixCopyPaste || order.status !== "PENDING") return order;

  const settings = await getSettingsFresh();
  const expiresIn = Math.min(1440, Math.max(5, settingInt(settings, "pix_expiration_minutes", 30))) * 60;
  const main = order.items.find((i) => i.kind === "PRODUCT" || i.kind === "UPSELL") ?? order.items[0];
  const store = settings.store_name || "Além da Fome";
  const description = `${store} ${order.orderNumber} — ${order.items.map((i) => `${i.quantity}x ${i.productName}`).join(", ")}`;
  const snap = order.customerSnapshot as { cpf?: string | null };

  await logOrderEvent(order.id, "payment_request", "Solicitando PIX ao gateway", { amount_cents: order.totalCents, external_reference: order.externalReference, expires_in: expiresIn });

  try {
    const charge = await paymentService.createPixPayment({
      amountCents: order.totalCents,
      idempotencyKey: order.externalReference === order.orderNumber ? `adf-${order.id}` : `adf-${order.id}-${order.externalReference}`,
      externalReference: order.externalReference!,
      description,
      customer: { name: order.customer.name, email: order.customer.email, cpf: snap.cpf ?? order.customer.cpf ?? "", phone: order.customer.phone },
      metadata: {
        order_id: order.id,
        order_number: order.orderNumber ?? "",
        product_id: main?.productId ?? "",
        sku: main?.sku ?? "",
        session_id: order.sessionId ?? "",
        customer_id: order.customerId,
        source: order.source,
      },
      utm: { source: order.utmSource, medium: order.utmMedium, campaign: order.utmCampaign, content: order.utmContent, term: order.utmTerm, fbclid: order.fbclid, gclid: order.gclid, ttclid: order.ttclid },
      expiresInSeconds: expiresIn,
    });

    const moved = await db.order.updateMany({
      where: { id: order.id, status: "PENDING" },
      data: {
        status: "PIX_GENERATED",
        transactionId: charge.transactionId,
        pixCopyPaste: charge.copyPaste,
        pixExpiresAt: charge.expiresAt ?? new Date(Date.now() + expiresIn * 1000),
        feeCents: charge.feeCents,
        netCents: charge.netCents,
        paymentError: null,
      },
    });
    if (moved.count) {
      await db.payment.upsert({
        where: { transactionId: charge.transactionId },
        update: {},
        create: { orderId: order.id, provider: charge.provider, transactionId: charge.transactionId, status: "PENDING", amountCents: charge.amountCents, feeCents: charge.feeCents, netCents: charge.netCents, metadata: sanitize(charge.metadata) },
      });
      await logOrderEvent(order.id, "payment_response", "PIX gerado", { transaction_id: charge.transactionId, status: charge.status, expires_at: charge.expiresAt }, "PIX_GENERATED");
      await trackServerEvent(order, "pix_generated", { valueCents: order.totalCents, productId: main?.productId });
      await trackServerEvent(order, "payment_pending", { valueCents: order.totalCents });
      await onPixGeneratedEmail(order.id, order.customer.email).catch((e) => log.error("email", "falha ao agendar lembrete", { error: e instanceof Error ? e.message : String(e) }));
    }
    return db.order.findUniqueOrThrow({ where: { id: order.id } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "erro desconhecido";
    const code = err instanceof PaymentError ? err.code : undefined;
    await db.order.update({ where: { id: order.id }, data: { paymentError: message.slice(0, 300) } });
    await logOrderEvent(order.id, "payment_error", `Falha ao gerar PIX: ${message}`, { code, status: err instanceof PaymentError ? err.status : undefined }, "ERROR");
    await trackServerEvent(order, "pix_error", { props: { code: code ?? null } });
    log.error("checkout", "falha ao gerar PIX", { order: order.orderNumber, code, message });
    throw new CheckoutError("Não conseguimos gerar o PIX agora. Tente novamente.", 502);
  }
}

// ───────────────────────── Status de pagamento ─────────────────────────

const STATUS_MAP: Record<PaymentStatus, { order: OrderStatus | null; payment: DbPaymentStatus }> = {
  PENDING: { order: null, payment: "PENDING" },
  PAID: { order: "PAID", payment: "PAID" },
  EXPIRED: { order: "EXPIRED", payment: "EXPIRED" },
  REFUNDED: { order: "REFUNDED", payment: "REFUNDED" },
  CHARGEBACK: { order: "CHARGEBACK", payment: "CHARGEBACK" },
  FAILED: { order: "FAILED", payment: "FAILED" },
};

export type ApplyResult = { order: Order | null; previousStatus: OrderStatus | null; newStatus: OrderStatus | null; changed: boolean; note?: string };

/**
 * ÚNICO ponto do sistema que altera o status de pagamento de um pedido.
 * Chamado pelo webhook (push), polling e reconciliação (pull). Nunca pelo navegador.
 * Os efeitos de "pago" rodam exatamente uma vez (update condicional no banco).
 */
export async function applyPaymentSnapshot(
  orderId: string,
  snap: PaymentSnapshot,
  source: "webhook" | "poll" | "reconcile" | "admin",
  statusOverride?: PaymentStatus | null
): Promise<ApplyResult> {
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) return { order: null, previousStatus: null, newStatus: null, changed: false, note: "order_not_found" };

  const remote = statusOverride ?? snap.status;
  const mapped = STATUS_MAP[remote];
  if (!mapped) {
    await logOrderEvent(order.id, "status_ignored", `Status desconhecido "${remote}" (${source})`, { transaction_id: snap.transactionId });
    return { order, previousStatus: order.status, newStatus: order.status, changed: false, note: "unknown_status" };
  }
  await db.order.update({ where: { id: order.id }, data: { lastCheckedAt: new Date() } });
  if (!mapped.order) return { order, previousStatus: order.status, newStatus: order.status, changed: false, note: "still_pending" };

  if (mapped.order === "PAID" && snap.amountCents < order.totalCents) {
    await logOrderEvent(order.id, "amount_mismatch", `Valor pago (${snap.amountCents}) menor que o total (${order.totalCents}) — não marcado como pago`, { transaction_id: snap.transactionId, source }, "WARNING");
    log.warn("payment", "valor divergente", { order: order.orderNumber, paid: snap.amountCents, total: order.totalCents });
    return { order, previousStatus: order.status, newStatus: order.status, changed: false, note: "amount_mismatch" };
  }
  if (!canTransition(order.status, mapped.order)) return { order, previousStatus: order.status, newStatus: order.status, changed: false, note: "transition_not_allowed" };

  const now = new Date();
  const paidAt = mapped.order === "PAID" ? (snap.paidAt ?? now) : undefined;
  const moved = await db.order.updateMany({
    where: { id: order.id, status: order.status },
    data: {
      status: mapped.order,
      paymentStatus: mapped.payment,
      transactionId: order.transactionId ?? snap.transactionId,
      feeCents: snap.feeCents ?? order.feeCents,
      netCents: snap.netCents ?? order.netCents,
      ...(paidAt ? { paidAt, paidAmountCents: snap.amountCents } : {}),
      ...(mapped.order === "EXPIRED" ? { expiredAt: now } : {}),
    },
  });
  if (moved.count === 0) {
    const current = await db.order.findUnique({ where: { id: order.id } });
    return { order: current, previousStatus: order.status, newStatus: current?.status ?? null, changed: false, note: "concurrent_update" };
  }

  await db.payment.upsert({
    where: { transactionId: snap.transactionId },
    update: { status: mapped.payment, feeCents: snap.feeCents ?? undefined, netCents: snap.netCents ?? undefined, tracking: sanitize(snap.tracking), ...(paidAt ? { paidAt } : {}) },
    create: {
      orderId: order.id,
      provider: snap.provider,
      transactionId: snap.transactionId,
      status: mapped.payment,
      amountCents: snap.amountCents,
      feeCents: snap.feeCents,
      netCents: snap.netCents,
      paidAt: paidAt ?? null,
      metadata: sanitize(snap.metadata),
      tracking: sanitize(snap.tracking),
    },
  });
  await logOrderEvent(order.id, "status_change", `${order.status} → ${mapped.order} (${source})`, { transaction_id: snap.transactionId, amount_cents: snap.amountCents, fee_cents: snap.feeCents, net_cents: snap.netCents }, mapped.order);
  log.info("payment", "status alterado", { order: order.orderNumber, from: order.status, to: mapped.order, source });

  if (mapped.order === "PAID") await onPaid(order.id);
  if (mapped.order === "REFUNDED" || mapped.order === "CHARGEBACK") await revokeOrderAccess(order.id, mapped.order === "REFUNDED" ? "Pedido reembolsado" : "Contestação de pagamento");
  if (mapped.order === "EXPIRED" || mapped.order === "FAILED") await cancelScheduled(order.id, "PIX_RECOVERY", `Pedido ${mapped.order}`);
  if (mapped.order === "EXPIRED") await trackServerEvent(order, "checkout_abandoned", { valueCents: order.totalCents, props: { reason: "pix_expired" } });

  const updated = await db.order.findUnique({ where: { id: order.id } });
  return { order: updated, previousStatus: order.status, newStatus: mapped.order, changed: true };
}

/** Efeitos colaterais do pagamento confirmado — protegidos contra execução dupla. */
async function onPaid(orderId: string) {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { customer: true, items: { include: { product: true } } } });

  // 1–2. Libera os materiais adquiridos (um acesso por item: principal, order bump, upsell) — só aqui, após a confirmação
  let granted = 0;
  for (const item of order.items) {
    const exists = await db.digitalAccess.count({ where: { orderItemId: item.id } });
    if (exists) continue;
    const days = item.product?.digitalValidityDays;
    await db.digitalAccess.create({
      data: {
        orderItemId: item.id,
        token: randomToken(24),
        maxDownloads: item.product?.digitalMaxDownloads ?? null,
        expiresAt: days ? new Date(Date.now() + days * 86_400_000) : null,
      },
    });
    granted++;
  }
  if (granted) {
    await db.order.updateMany({ where: { id: order.id, deliveredAt: null }, data: { deliveredAt: new Date() } });
    await logOrderEvent(order.id, "access_granted", `Acesso digital liberado (${granted} item(ns))`, { items: order.items.map((i) => i.productName) }, "DELIVERED");
    await trackServerEvent(order, "access_granted", { valueCents: order.totalCents });
  }

  // 3. E-mail transacional com o acesso (e cancela o lembrete de PIX)
  await onOrderPaidEmail(order.id, order.customer.email).catch((e) => log.error("email", "falha na confirmação", { error: e instanceof Error ? e.message : String(e) }));
  await markQuizPurchased(order.id).catch(() => null);

  // Cupom: conta o uso uma única vez
  if (order.couponId) {
    const counted = await db.order.updateMany({ where: { id: order.id, couponCountedAt: null }, data: { couponCountedAt: new Date() } });
    if (counted.count) await db.coupon.update({ where: { id: order.couponId }, data: { usedCount: { increment: 1 } } }).catch(() => {});
  }

  // Analytics + Meta: Purchase somente aqui, com o valor realmente pago
  const tracked = await db.order.updateMany({ where: { id: order.id, purchaseTrackedAt: null }, data: { purchaseTrackedAt: new Date() } });
  if (!tracked.count) return;
  const value = order.paidAmountCents ?? order.totalCents;
  const main = order.items.find((i) => i.kind === "PRODUCT" || i.kind === "UPSELL");
  await trackServerEvent(order, "payment_paid", { valueCents: value, productId: main?.productId });
  await trackServerEvent(order, "purchase", { valueCents: value, productId: main?.productId, props: { order: order.orderNumber, source: order.source } });

  if (!order.adsConsent) return; // sem consentimento de marketing: nada vai para a Meta
  const [firstName, ...rest] = order.customer.name.split(/\s+/);
  await sendCapiEvent({
    eventName: "Purchase",
    eventId: order.metaEventId ?? `purchase_${order.id}`,
    eventSourceUrl: `${siteUrl()}/pedido/${order.orderNumber}`,
    eventTime: Math.floor((order.paidAt ?? new Date()).getTime() / 1000),
    user: {
      email: order.customer.email,
      phone: order.customer.phone,
      firstName,
      lastName: rest.at(-1),
      externalId: order.customerId,
      userAgent: order.userAgent,
      fbc: order.fbc ?? fbcFromClickId(order.fbclid, order.createdAt),
      fbp: order.fbp,
    },
    customData: {
      currency: "BRL",
      value: value / 100,
      order_id: order.orderNumber,
      content_type: "product",
      content_ids: order.items.map((i) => i.sku),
      contents: order.items.map((i) => ({ id: i.sku, quantity: i.quantity, item_price: i.unitPriceCents / 100 })),
      num_items: order.items.reduce((s, i) => s + i.quantity, 0),
    },
  });
}

// ───────────────────────── CREDIÁRIO (análise manual pelo admin) ─────────────────────────

const CREDIARIO_EVENT: Partial<Record<CrediarioStatus, "crediario_in_review" | "crediario_approved" | "crediario_rejected" | "crediario_cancelled" | "crediario_pending">> = {
  CREDIARIO_PENDENTE: "crediario_pending",
  CREDIARIO_EM_ANALISE: "crediario_in_review",
  CREDIARIO_APROVADO: "crediario_approved",
  CREDIARIO_RECUSADO: "crediario_rejected",
  CREDIARIO_CANCELADO: "crediario_cancelled",
};

/** Altera o status do crediário (pendente → análise → aprovado/recusado). Aprovado conta como pago. */
export async function updateCrediarioStatus(orderId: string, next: CrediarioStatus, actor: string, note?: string | null) {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  if (order.paymentMethod !== "CREDIARIO") throw new Error("Este pedido não é do crediário.");
  const from = order.status as CrediarioStatus;
  if (from === next) return { order, changed: false };
  if (!CREDIARIO_TRANSITIONS[from]?.includes(next)) throw new Error(`Transição não permitida: ${ORDER_STATUS_LABEL[from]} → ${ORDER_STATUS_LABEL[next]}.`);

  const now = new Date();
  const moved = await db.order.updateMany({
    where: { id: order.id, status: from },
    data: {
      status: next,
      ...(next === "CREDIARIO_APROVADO" ? { paymentStatus: "PAID", paidAt: now, paidAmountCents: order.totalCents } : {}),
      ...(next === "CREDIARIO_RECUSADO" ? { paymentStatus: "FAILED" } : {}),
    },
  });
  if (!moved.count) throw new Error("O status do pedido mudou. Recarregue a página.");
  if (note) await db.crediarioData.update({ where: { orderId }, data: { analysisNote: note.slice(0, 1000) } }).catch(() => {});
  await logOrderEvent(order.id, "status_change", `${ORDER_STATUS_LABEL[from]} → ${ORDER_STATUS_LABEL[next]} (${actor})`, note ? { note } : undefined, next);
  const ev = CREDIARIO_EVENT[next];
  if (ev) await trackServerEvent(order, ev, { valueCents: order.totalCents });
  if (next === "CREDIARIO_APROVADO") await onPaid(order.id); // confirmação, acesso digital, estoque, Purchase
  return { order: await db.order.findUniqueOrThrow({ where: { id: order.id } }), changed: true };
}

/**
 * PIX vencido → novo código no MESMO pedido (mesmo número, link e valores congelados).
 * Usa uma nova external_reference (HB12345-2026-R2-xxx) para o gateway criar outra cobrança;
 * webhooks da cobrança antiga deixam de casar com o pedido. Só é chamado por POST (nunca por GET,
 * para que scanners de link dos provedores de e-mail não gerem cobranças).
 */
export async function renewPix(orderId: string): Promise<Order> {
  let order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  const isAwaiting = (o: Order) => o.status === "PENDING" || o.status === "PIX_GENERATED";
  if (isAwaiting(order) && order.pixCopyPaste) {
    if (!order.pixExpiresAt || order.pixExpiresAt.getTime() > Date.now()) return order; // ainda válido
    order = await syncOrder(order, { minIntervalMs: 0, source: "poll" }); // pago no último segundo?
  }
  const expiredAwaiting = isAwaiting(order) && !!order.pixExpiresAt && order.pixExpiresAt.getTime() <= Date.now();
  if (order.status !== "EXPIRED" && order.status !== "FAILED" && !expiredAwaiting) return order;
  const attempt = (await db.payment.count({ where: { orderId } })) + 1;
  const ref = `${order.orderNumber}-R${attempt}-${randomInt(100, 1000)}`;
  const moved = await db.order.updateMany({
    where: { id: order.id, status: order.status, externalReference: order.externalReference },
    data: { status: "PENDING", externalReference: ref, transactionId: null, pixCopyPaste: null, pixExpiresAt: null, paymentError: null, lastCheckedAt: null },
  });
  if (!moved.count) return db.order.findUniqueOrThrow({ where: { id: order.id } });
  await logOrderEvent(order.id, "pix_renewed", `Novo PIX solicitado pelo cliente (anterior: ${order.status})`, { previous_reference: order.externalReference, new_reference: ref }, "PENDING");
  return ensurePix(order.id);
}

const FINAL: OrderStatus[] = ["PAID", "REFUNDED", "CHARGEBACK", "CANCELLED"];

/** Reembolso/contestação/cancelamento de pedido pago: revoga o acesso aos materiais (registrado no pedido). */
export async function revokeOrderAccess(orderId: string, reason: string) {
  const r = await db.digitalAccess.updateMany({ where: { orderItem: { orderId }, revokedAt: null }, data: { revokedAt: new Date() } });
  if (r.count) await logOrderEvent(orderId, "access_revoked", `Acesso revogado: ${reason}`, { count: r.count }, "REVOKED");
  return r.count;
}

/** Consulta o gateway e aplica o status (pull). Throttled por lastCheckedAt. */
export async function syncOrder(order: Order, opts: { minIntervalMs?: number; source?: "poll" | "reconcile" | "admin" } = {}) {
  const minInterval = opts.minIntervalMs ?? 5000;
  if (FINAL.includes(order.status) || !order.externalReference || !order.pixCopyPaste) return order;
  if (order.lastCheckedAt && Date.now() - new Date(order.lastCheckedAt).getTime() < minInterval) return order;

  await db.order.update({ where: { id: order.id }, data: { lastCheckedAt: new Date() } });
  try {
    const snap = await paymentService.getPaymentStatus(order.externalReference);
    if (snap && snap.status !== "PENDING") return (await applyPaymentSnapshot(order.id, snap, opts.source ?? "poll")).order ?? order;
  } catch (err) {
    await logOrderEvent(order.id, "poll_error", `Falha na consulta: ${err instanceof Error ? err.message : "erro"}`, undefined, "ERROR");
    return order;
  }

  // Sem confirmação e PIX vencido há mais de 10 min → expira localmente.
  if (order.status === "PIX_GENERATED" && order.pixExpiresAt && new Date(order.pixExpiresAt).getTime() < Date.now() - 10 * 60_000) {
    const moved = await db.order.updateMany({ where: { id: order.id, status: "PIX_GENERATED" }, data: { status: "EXPIRED", paymentStatus: "EXPIRED", expiredAt: new Date() } });
    if (moved.count) {
      await logOrderEvent(order.id, "status_change", "PIX_GENERATED → EXPIRED (prazo do PIX encerrado)", undefined, "EXPIRED");
      await trackServerEvent(order, "checkout_abandoned", { valueCents: order.totalCents, props: { reason: "pix_expired" } });
    }
    return (await db.order.findUnique({ where: { id: order.id } })) ?? order;
  }
  return order;
}

/** Reconciliação server-side de PIX pendentes (cron). Limitada para respeitar o rate limit da API. */
export async function reconcilePendingOrders(limit = 20) {
  const pending = await db.order.findMany({
    where: {
      status: "PIX_GENERATED",
      createdAt: { gte: new Date(Date.now() - 3 * 86_400_000) },
      OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: new Date(Date.now() - 2 * 60_000) } }],
    },
    orderBy: { lastCheckedAt: { sort: "asc", nulls: "first" } },
    take: limit,
  });
  let paid = 0;
  let expired = 0;
  for (const o of pending) {
    const r = await syncOrder(o, { minIntervalMs: 0, source: "reconcile" });
    if (r?.status === "PAID") paid++;
    if (r?.status === "EXPIRED") expired++;
  }
  // Pedidos que nunca conseguiram gerar PIX há mais de 24h → cancelados
  const stale = await db.order.updateMany({
    where: { status: "PENDING", pixCopyPaste: null, createdAt: { lt: new Date(Date.now() - 86_400_000) } },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
  return { checked: pending.length, paid, expired, cancelledWithoutPix: stale.count };
}

// ───────────────────────── Acesso público ao pedido ─────────────────────────

const deliverableMaterials = { where: { status: "READY" as const }, orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }] };
const materialSelect = { id: true, title: true, description: true, howToUse: true, format: true, source: true, fileName: true, fileSize: true, externalUrl: true, uploadId: true } as const;

export async function findOrderByAccess(orderNumber: string | null | undefined, token: string | null | undefined) {
  if (!orderNumber || !token || token.length < 16 || orderNumber.length > 40) return null;
  const order = await db.order.findUnique({
    where: { orderNumber },
    include: {
      items: {
        include: {
          product: { select: { digitalDeliveryNote: true, includedProductIds: true, materials: { ...deliverableMaterials, select: materialSelect }, _count: { select: { materials: { where: { status: "PENDING" } } } } } },
          digitalAccess: true,
        },
      },
      customer: { select: { name: true } },
      parentOrder: { select: { orderNumber: true, accessToken: true } },
      upsellOrders: { select: { orderNumber: true, accessToken: true, status: true, items: { select: { productName: true }, take: 1 } } },
      crediario: { select: { methodLabel: true, installmentLabel: true, installments: true } },
    },
  });
  if (!order || !safeEqual(order.accessToken, token)) return null;
  // Produtos "já inclusos" (ex.: o Completo inclui o E-book): os materiais deles também são entregues
  const included = [...new Set(order.items.flatMap((i) => ids(i.product?.includedProductIds)))];
  if (included.length) {
    const extra = await db.digitalMaterial.findMany({ where: { productId: { in: included }, ...deliverableMaterials.where }, orderBy: deliverableMaterials.orderBy, select: { ...materialSelect, productId: true } });
    for (const item of order.items) {
      if (!item.product) continue;
      const inc = ids(item.product.includedProductIds);
      const own = new Set(item.product.materials.map((m) => m.id));
      const add = extra.filter((m) => inc.includes(m.productId) && !own.has(m.id)).map(({ productId: _p, ...m }) => m);
      item.product.materials = [...add, ...item.product.materials];
    }
  }
  return order;
}

type AccessOrder = NonNullable<Awaited<ReturnType<typeof findOrderByAccess>>>;

/** Material entregável: arquivo com upload concluído ou link externo preenchido. */
const isDeliverable = (m: { source: string; uploadId: string | null; externalUrl: string | null }) => (m.source === "link" ? Boolean(m.externalUrl) : Boolean(m.uploadId));

export function toPublicOrder(o: AccessOrder): PublicOrder {
  const awaiting = o.status === "PENDING" || o.status === "PIX_GENERATED";
  const paid = isPaidStatus(o.status);
  return {
    orderNumber: o.orderNumber!,
    status: o.status,
    paymentMethod: o.paymentMethod,
    crediario: o.crediario ? { methodLabel: o.crediario.methodLabel, installmentLabel: o.crediario.installmentLabel } : null,
    source: o.source,
    parent: o.parentOrder?.orderNumber ? { orderNumber: o.parentOrder.orderNumber, token: o.parentOrder.accessToken } : null,
    totalCents: o.totalCents,
    subtotalCents: o.subtotalCents,
    discountCents: o.discountCents,
    couponCode: o.couponCode,
    pixCopyPaste: awaiting ? o.pixCopyPaste : null,
    pixExpiresAt: o.pixExpiresAt?.toISOString() ?? null,
    paidAt: o.paidAt?.toISOString() ?? null,
    createdAt: o.createdAt.toISOString(),
    metaEventId: o.metaEventId,
    customerFirstName: o.customer.name.split(/\s+/)[0],
    pixError: awaiting && !o.pixCopyPaste && Boolean(o.paymentError),
    items: o.items.map((i) => ({ name: i.productName, kind: i.kind, quantity: i.quantity, unitPriceCents: i.unitPriceCents, totalPriceCents: i.totalPriceCents })),
    // Materiais SÓ aparecem com pagamento confirmado e acesso válido (não revogado/expirado)
    digital: paid
      ? o.items.flatMap((i) =>
          i.digitalAccess
            .filter((a) => !a.revokedAt)
            .map((a) => {
              const valid = (!a.expiresAt || a.expiresAt > new Date()) && (a.maxDownloads == null || a.downloads < a.maxDownloads);
              const mats = (i.product?.materials ?? []).filter(isDeliverable);
              return {
                name: i.productName,
                token: a.token,
                available: valid && mats.length > 0,
                note: i.product?.digitalDeliveryNote ?? null,
                downloads: a.downloads,
                maxDownloads: a.maxDownloads,
                expiresAt: a.expiresAt?.toISOString() ?? null,
                materials: valid
                  ? mats.map((m) => ({ id: m.id, title: m.title, description: m.description, howToUse: m.howToUse, format: m.format, source: m.source, fileName: m.fileName, fileSize: m.fileSize, href: `/api/acesso/${a.token}/${m.id}` }))
                  : [],
                pendingCount: i.product?._count.materials ?? 0,
              };
            })
        )
      : [],
    children: o.upsellOrders.filter((c) => c.orderNumber).map((c) => ({ orderNumber: c.orderNumber!, token: c.accessToken, status: c.status, name: c.items[0]?.productName ?? "Pedido complementar" })),
  };
}

// ───────────────────────── Entrega digital ─────────────────────────

/**
 * Valida o token do acesso + material: pedido pago, acesso não revogado/expirado, material pronto e do produto comprado.
 * Registra o acesso (contador + linha do tempo do pedido). Arquivos privados nunca têm URL pública.
 */
export async function resolveMaterialAccess(token: string, materialId: string) {
  const access = await db.digitalAccess.findUnique({ where: { token }, include: { orderItem: { include: { order: true } } } });
  if (!access || access.revokedAt) return { ok: false as const, status: 404, reason: "Link inválido ou acesso revogado." };
  const order = access.orderItem.order;
  if (!isPaidStatus(order.status)) return { ok: false as const, status: 403, reason: "O acesso é liberado após a confirmação do pagamento." };
  if (access.expiresAt && access.expiresAt < new Date()) return { ok: false as const, status: 403, reason: "Este acesso expirou. Fale com o suporte." };
  if (access.maxDownloads != null && access.downloads >= access.maxDownloads) return { ok: false as const, status: 403, reason: "Limite de acessos atingido. Fale com o suporte." };
  const allowed = access.orderItem.productId ? await materialProductIds(access.orderItem.productId) : [];
  const material = await db.digitalMaterial.findFirst({ where: { id: materialId, productId: { in: allowed }, status: "READY" } });
  if (!material || !isDeliverable(material)) return { ok: false as const, status: 404, reason: "Este material não está disponível." };

  const updated = await db.digitalAccess.updateMany({
    where: { id: access.id, ...(access.maxDownloads != null ? { downloads: { lt: access.maxDownloads } } : {}) },
    data: { downloads: { increment: 1 }, lastAccessAt: new Date() },
  });
  if (!updated.count) return { ok: false as const, status: 403, reason: "Limite de acessos atingido." };
  await logOrderEvent(order.id, "digital_download", `Acesso ao material: ${material.title}`, { material: material.id, downloads: access.downloads + 1 });
  await trackServerEvent(order, "digital_download", { productId: access.orderItem.productId, props: { material: material.id } });
  return { ok: true as const, material };
}

/** Registra que a cliente abriu a área de acesso (página do pedido pago). */
export async function recordAccessView(o: AccessOrder) {
  if (!isPaidStatus(o.status)) return;
  const ids = o.items.flatMap((i) => i.digitalAccess.map((a) => a.id));
  if (!ids.length) return;
  await db.digitalAccess.updateMany({ where: { id: { in: ids } }, data: { views: { increment: 1 }, lastAccessAt: new Date() } }).catch(() => null);
}

// ───────────────────────── Upsell pós-compra ─────────────────────────

/** Produtos já comprados na "família" do pedido (principal + upsells). */
async function purchasedProductIds(parentId: string) {
  const items = await db.orderItem.findMany({ where: { order: { OR: [{ id: parentId }, { parentOrderId: parentId }] } }, select: { productId: true } });
  return new Set(items.map((i) => i.productId).filter(Boolean) as string[]);
}

/**
 * Próximo upsell da sequência para um pedido pago: respeita ordem, regras,
 * não repete oferta já aceita/recusada e não oferece produto já comprado/incluso.
 */
export async function getNextUpsell(parent: Order): Promise<PublicUpsell | null> {
  if (!isPaidStatus(parent.status) || parent.source !== "STOREFRONT") return null;
  const [upsells, decided, owned] = await Promise.all([
    db.upsell.findMany({ where: { active: true }, include: { product: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    db.upsellEvent.findMany({ where: { orderId: parent.id, action: { in: ["ACCEPT", "REJECT"] } }, select: { upsellId: true } }),
    purchasedProductIds(parent.id),
  ]);
  const decidedIds = new Set(decided.map((d) => d.upsellId));
  const ownedProducts = await db.product.findMany({ where: { id: { in: [...owned] } }, select: { includedProductIds: true } });
  const included = new Set(ownedProducts.flatMap((p) => ids(p.includedProductIds)));
  // Só oferece produto com material pronto para entrega (nunca vende conteúdo inexistente)
  const ready = new Set((await db.digitalMaterial.findMany({ where: { productId: { in: upsells.map((u) => u.productId) }, status: "READY" }, select: { productId: true } })).map((m) => m.productId));

  const candidates = upsells.filter((u) => {
    if (decidedIds.has(u.id) || !isSellable(u.product) || !ready.has(u.productId) || owned.has(u.productId) || included.has(u.productId)) return false;
    const triggers = ids(u.triggerProductIds);
    return !triggers.length || triggers.some((t) => owned.has(t));
  });
  const u = candidates[0];
  if (!u) return null;
  const price = effectivePrice(u.product);
  const priceCents = u.priceCents && u.priceCents > 0 ? u.priceCents : price.priceCents;
  const reference = Math.max(price.priceCents, price.listPriceCents ?? 0);
  return {
    id: u.id,
    headline: u.headline,
    title: u.title,
    description: u.description ?? u.product.shortDescription,
    imageUrl: u.imageUrl ?? u.product.imageUrl,
    productName: u.product.name,
    priceCents,
    listPriceCents: reference > priceCents ? reference : null,
    position: upsells.findIndex((x) => x.id === u.id) + 1,
  };
}

export async function recordUpsellEvent(parent: Order, upsellId: string, action: "VIEW" | "ACCEPT" | "REJECT", extra: { childOrderId?: string; priceCents?: number } = {}) {
  try {
    await db.upsellEvent.create({ data: { orderId: parent.id, upsellId, action, childOrderId: extra.childOrderId ?? null, priceCents: extra.priceCents ?? null } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return false; // já registrado (idempotente)
    throw err;
  }
  const name = action === "VIEW" ? "upsell_view" : action === "ACCEPT" ? "upsell_accept" : "upsell_reject";
  await trackServerEvent(parent, name, { valueCents: extra.priceCents ?? null, props: { upsellId } });
  return true;
}

/**
 * Cria um pedido complementar (upsell OU downsell) com PIX próprio, copiando a atribuição do pedido pai.
 * PIX não permite cobrança "one-click": cada oferta aceita vira um novo PIX, e o pedido original nunca muda.
 */
async function createComplementaryOrder(parent: Order, p: { id: string; name: string; sku: string; category: Prisma.OrderItemCreateWithoutOrderInput["category"]; fulfillment: Prisma.OrderItemCreateWithoutOrderInput["fulfillment"]; priceCents: number }, priceCents: number, checkoutToken: string, meta: RequestMeta, upsellId?: string) {
  return db.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        source: "UPSELL",
        parentOrderId: parent.id,
        customerId: parent.customerId,
        customerSnapshot: parent.customerSnapshot as Prisma.InputJsonValue,
        subtotalCents: priceCents,
        totalCents: priceCents,
        checkoutToken,
        accessToken: randomToken(24),
        experiments: (parent.experiments ?? undefined) as Prisma.InputJsonValue | undefined,
        userAgent: cut(meta.userAgent, 300),
        device: parent.device,
        ipHash: hashIp(meta.ip),
        utmSource: parent.utmSource,
        utmMedium: parent.utmMedium,
        utmCampaign: parent.utmCampaign,
        utmContent: parent.utmContent,
        utmTerm: parent.utmTerm,
        firstTouchSource: parent.firstTouchSource,
        firstTouchMedium: parent.firstTouchMedium,
        firstTouchCampaign: parent.firstTouchCampaign,
        firstTouchContent: parent.firstTouchContent,
        firstTouchTerm: parent.firstTouchTerm,
        adsConsent: parent.adsConsent,
        fbclid: parent.fbclid,
        gclid: parent.gclid,
        ttclid: parent.ttclid,
        fbp: parent.fbp,
        fbc: parent.fbc,
        landingPage: parent.landingPage,
        referrer: parent.referrer,
        sessionId: parent.sessionId,
        visitorId: parent.visitorId,
        channel: parent.channel,
        items: {
          create: {
            kind: "UPSELL",
            productId: p.id,
            productName: p.name,
            sku: p.sku,
            category: p.category,
            fulfillment: p.fulfillment,
            quantity: 1,
            unitPriceCents: priceCents,
            listPriceCents: p.priceCents,
            totalPriceCents: priceCents,
            upsellId: upsellId ?? null,
          },
        },
      },
    });
    const orderNumber = await uniqueOrderNumber(tx, created.seq);
    return tx.order.update({ where: { id: created.id }, data: { orderNumber, externalReference: orderNumber, metaEventId: `purchase_${created.id}` } });
  }, TX_OPTS);
}

/**
 * Aceite de upsell: cria um pedido complementar com novo PIX. O pedido original nunca é alterado.
 */
export async function acceptUpsell(parentId: string, upsellId: string, meta: RequestMeta) {
  const parent = await db.order.findUniqueOrThrow({ where: { id: parentId } });
  if (!isPaidStatus(parent.status)) throw new CheckoutError("A oferta só está disponível após a confirmação do pagamento.");
  const next = await getNextUpsell(parent);
  if (!next || next.id !== upsellId) {
    const already = await db.upsellEvent.findFirst({ where: { orderId: parent.id, upsellId, action: "ACCEPT" } });
    if (already?.childOrderId) return db.order.findUniqueOrThrow({ where: { id: already.childOrderId } });
    throw new CheckoutError("Esta oferta não está mais disponível.", 409);
  }
  const upsell = await db.upsell.findUniqueOrThrow({ where: { id: upsellId }, include: { product: true } });
  const token = `upsell_${parent.id}_${upsell.id}`.slice(0, 64);
  const existing = await db.order.findUnique({ where: { checkoutToken: token } });
  if (existing) return existing.pixCopyPaste || existing.status !== "PENDING" ? existing : ensurePix(existing.id);

  const order = await createComplementaryOrder(parent, upsell.product, next.priceCents, token, meta, upsell.id);
  await recordUpsellEvent(parent, upsell.id, "ACCEPT", { childOrderId: order.id, priceCents: next.priceCents });
  await logOrderEvent(order.id, "order_created", `Pedido complementar (upsell) de ${parent.orderNumber}`, { upsell: upsell.name });
  await logOrderEvent(parent.id, "upsell_accepted", `Upsell "${upsell.name}" aceito — pedido ${order.orderNumber}`);
  return ensurePix(order.id);
}

// ───────────────────────── Downsell (oferecido só ao recusar o upsell) ─────────────────────────

/** O downsell vinculado a um upsell, se ativo, elegível e ainda não decidido para este pedido. */
export async function getDownsellForUpsell(parent: Order, upsellId: string): Promise<PublicUpsell | null> {
  if (!isPaidStatus(parent.status) || parent.source !== "STOREFRONT") return null;
  const ds = await db.downsell.findUnique({ where: { upsellId }, include: { product: true } });
  if (!ds || !ds.active || !isSellable(ds.product)) return null;

  const decided = await db.downsellEvent.findFirst({ where: { orderId: parent.id, downsellId: ds.id, action: { in: ["ACCEPT", "REJECT"] } } });
  if (decided) return null;

  const owned = await purchasedProductIds(parent.id);
  if (owned.has(ds.productId)) return null;
  const ownedProducts = await db.product.findMany({ where: { id: { in: [...owned] } }, select: { includedProductIds: true } });
  const included = new Set(ownedProducts.flatMap((p) => ids(p.includedProductIds)));
  if (included.has(ds.productId)) return null;
  // Só oferece produto com material pronto (nunca vende conteúdo inexistente)
  if ((await db.digitalMaterial.count({ where: { productId: ds.productId, status: "READY" } })) === 0) return null;

  const price = effectivePrice(ds.product);
  const priceCents = ds.priceCents && ds.priceCents > 0 ? ds.priceCents : price.priceCents;
  const reference = Math.max(price.priceCents, price.listPriceCents ?? 0);
  return {
    id: ds.id,
    kind: "downsell",
    headline: ds.headline,
    title: ds.title,
    description: ds.description ?? ds.product.shortDescription,
    imageUrl: ds.imageUrl ?? ds.product.imageUrl,
    productName: ds.product.name,
    priceCents,
    listPriceCents: reference > priceCents ? reference : null,
    position: 0,
  };
}

export async function recordDownsellEvent(parent: Order, downsellId: string, action: "VIEW" | "ACCEPT" | "REJECT", extra: { childOrderId?: string; priceCents?: number } = {}) {
  try {
    await db.downsellEvent.create({ data: { orderId: parent.id, downsellId, action, childOrderId: extra.childOrderId ?? null, priceCents: extra.priceCents ?? null } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return false;
    throw err;
  }
  const name = action === "VIEW" ? "downsell_view" : action === "ACCEPT" ? "downsell_accept" : "downsell_reject";
  await trackServerEvent(parent, name, { valueCents: extra.priceCents ?? null, props: { downsellId } });
  return true;
}

/** Aceite de downsell: cria um pedido complementar com novo PIX (igual ao upsell). */
export async function acceptDownsell(parentId: string, downsellId: string, meta: RequestMeta) {
  const parent = await db.order.findUniqueOrThrow({ where: { id: parentId } });
  if (!isPaidStatus(parent.status)) throw new CheckoutError("A oferta só está disponível após a confirmação do pagamento.");
  const ds = await db.downsell.findUniqueOrThrow({ where: { id: downsellId }, include: { product: true } });
  const offer = await getDownsellForUpsell(parent, ds.upsellId);
  if (!offer || offer.id !== downsellId) {
    const already = await db.downsellEvent.findFirst({ where: { orderId: parent.id, downsellId, action: "ACCEPT" } });
    if (already?.childOrderId) return db.order.findUniqueOrThrow({ where: { id: already.childOrderId } });
    throw new CheckoutError("Esta oferta não está mais disponível.", 409);
  }
  const token = `downsell_${parent.id}_${ds.id}`.slice(0, 64);
  const existing = await db.order.findUnique({ where: { checkoutToken: token } });
  if (existing) return existing.pixCopyPaste || existing.status !== "PENDING" ? existing : ensurePix(existing.id);

  const order = await createComplementaryOrder(parent, ds.product, offer.priceCents, token, meta);
  await recordDownsellEvent(parent, ds.id, "ACCEPT", { childOrderId: order.id, priceCents: offer.priceCents });
  await logOrderEvent(order.id, "order_created", `Pedido complementar (downsell) de ${parent.orderNumber}`, { downsell: ds.name });
  await logOrderEvent(parent.id, "downsell_accepted", `Downsell "${ds.name}" aceito — pedido ${order.orderNumber}`);
  return ensurePix(order.id);
}
