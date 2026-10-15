import "server-only";
import type { EmailType } from "@prisma/client";
import { db } from "@/lib/db";
import { siteUrl } from "@/lib/env";
import { log } from "@/lib/log";
import { trackServerEvent } from "@/lib/analytics";
import { deliver, emailProvider } from "@/lib/email/provider";
import { getSettingsFresh, isOn, settingInt, type Settings } from "@/server/settings";
import {
  accessResendEmail,
  checkoutRecoveryEmail,
  orderCreatedEmail,
  pixRecoveryEmail,
  purchaseConfirmationEmail,
  quizResultEmail,
  supportAckEmail,
  supportNotificationEmail,
  type EmailBrand,
  type EmailOrder,
  type EmailTexts,
} from "@/emails/templates";
import { leadRecoveryUrl, leadUnsubscribeUrl } from "@/server/checkout-leads";
import { isAwaitingStatus, isPaidStatus, PAYMENT_METHOD_LABEL } from "@/lib/domain";

/**
 * E-mails TRANSACIONAIS (pedido, pagamento, acesso, reenvio, suporte, resultado do quiz solicitado).
 * Comunicações promocionais NÃO são enviadas por aqui: dependem de base legal/consentimento
 * (o consentimento de marketing fica registrado no cliente e no lead do quiz para uso futuro).
 */

export const EMAIL_TYPE_LABEL: Record<EmailType, string> = {
  ORDER_CREATED: "Pedido recebido (PIX gerado)",
  PURCHASE_CONFIRMATION: "Pagamento confirmado + acesso",
  PIX_RECOVERY: "Lembrete de PIX pendente",
  ACCESS_RESEND: "Reenvio de acesso",
};

/** Prefixo das chaves de texto de cada tipo em Configurações → E-mails. */
const TEXT_PREFIX: Record<EmailType, string> = {
  ORDER_CREATED: "email_order",
  PURCHASE_CONFIRMATION: "email_confirmation",
  PIX_RECOVERY: "email_recovery",
  ACCESS_RESEND: "email_access",
};

async function loadOrder(orderId: string) {
  return db.order.findUnique({ where: { id: orderId }, include: { customer: true, items: { include: { product: { select: { digitalDeliveryNote: true } } } }, crediario: { select: { methodLabel: true, installmentLabel: true } } } });
}
type LoadedOrder = NonNullable<Awaited<ReturnType<typeof loadOrder>>>;

const abs = (url: string) => (url.startsWith("http") ? url : `${siteUrl()}${url}`);

export function brandFromSettings(s: Settings): EmailBrand {
  const base = siteUrl();
  const digits = (s.whatsapp ?? "").replace(/\D/g, "");
  const logo = s.email_logo_url || s.logo_url;
  return {
    store: s.store_name || "Além da Fome",
    // Clientes de e-mail não exibem SVG/WebP de forma confiável: logo só se for PNG/JPG
    logoUrl: logo && /\.(png|jpe?g|gif)(\?.*)?$/i.test(logo) ? abs(logo) : null,
    siteUrl: base,
    primary: s.theme_primary || "#A65B42",
    sage: s.theme_secondary || "#6B7B5F",
    ink: s.theme_ink || "#3B2A22",
    background: s.theme_background || "#FAF6F1",
    whatsappUrl: digits.length >= 10 ? `https://wa.me/${digits.startsWith("55") ? digits : `55${digits}`}` : null,
    contactEmail: s.contact_email || null,
    companyLine: [s.company_name, s.company_document ? `CNPJ ${s.company_document}` : ""].filter(Boolean).join(" · ") || null,
  };
}

export const textsFor = (s: Settings, type: EmailType | "checkout"): EmailTexts => {
  const prefix = type === "checkout" ? "email_checkout" : TEXT_PREFIX[type];
  return { subject: s[`${prefix}_subject`] ?? "", title: s[`${prefix}_title`] ?? "", text: s[`${prefix}_text`] ?? "", button: s[`${prefix}_button`] || "Abrir" };
};

export function toEmailOrder(o: LoadedOrder): EmailOrder {
  return {
    orderNumber: o.orderNumber ?? o.id,
    firstName: o.customer.name.split(/\s+/)[0],
    items: o.items.map((i) => ({ name: i.productName, quantity: i.quantity, totalCents: i.totalPriceCents, kind: i.kind })),
    subtotalCents: o.subtotalCents,
    discountCents: o.discountCents,
    totalCents: o.totalCents,
    paymentLabel: o.paymentMethod === "CREDIARIO" ? `${o.crediario?.methodLabel ?? PAYMENT_METHOD_LABEL.CREDIARIO}${o.crediario?.installmentLabel ? ` · ${o.crediario.installmentLabel}` : ""}` : "PIX",
    pixCopyPaste: o.pixCopyPaste,
    pixExpiresAt: o.pixExpiresAt,
    pixExpired: o.status === "EXPIRED" || o.status === "FAILED" || !o.pixCopyPaste || (!!o.pixExpiresAt && o.pixExpiresAt < new Date()),
    isUpsell: o.source === "UPSELL",
    accessNote: o.items.map((i) => i.product?.digitalDeliveryNote).find(Boolean) ?? null,
  };
}

/** Página do pedido = área de acesso aos materiais (protegida pelo token secreto do pedido). */
export const orderUrl = (o: { orderNumber: string | null; accessToken: string }) => `${siteUrl()}/pedido/${encodeURIComponent(o.orderNumber ?? "")}?t=${encodeURIComponent(o.accessToken)}`;

/** Descadastro dos lembretes (link no rodapé + List-Unsubscribe one-click, RFC 8058). */
export const unsubscribeUrl = (o: { orderNumber: string | null; accessToken: string }) =>
  `${siteUrl()}/api/email/unsubscribe?pedido=${encodeURIComponent(o.orderNumber ?? "")}&t=${encodeURIComponent(o.accessToken)}`;

export function renderEmail(type: EmailType, o: LoadedOrder, s: Settings): { subject: string; html: string; text: string; headers?: Record<string, string> } {
  const b = brandFromSettings(s);
  const data = toEmailOrder(o);
  const url = orderUrl(o);
  const t = textsFor(s, type);
  if (type === "PIX_RECOVERY") {
    const unsub = unsubscribeUrl(o);
    return { ...pixRecoveryEmail(b, data, url, t, unsub), headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } };
  }
  if (type === "ORDER_CREATED") return orderCreatedEmail(b, data, url, t);
  if (type === "ACCESS_RESEND") return accessResendEmail(b, data, url, t);
  const confirmation = data.isUpsell ? { ...t, subject: s.email_upsell_subject || t.subject, title: s.email_upsell_title || t.title, text: s.email_upsell_text || t.text } : t;
  return purchaseConfirmationEmail(b, data, url, confirmation);
}

/** O e-mail ainda faz sentido no momento do envio? (evita lembrete de PIX já pago, acesso sem pagamento…) */
function eligibility(type: EmailType, o: LoadedOrder, manual: boolean): string | null {
  if (type === "PIX_RECOVERY") {
    if (o.customer.emailOptOutAt && !manual) return "Cliente descadastrou dos lembretes";
    const renewable = o.status === "EXPIRED" || o.status === "FAILED";
    if (!isAwaitingStatus(o.status) && !(manual && renewable)) return `Pedido não está aguardando pagamento (${o.status})`;
    if (!manual) {
      if (!o.pixCopyPaste) return "PIX não foi gerado";
      if (o.pixExpiresAt && o.pixExpiresAt < new Date()) return "PIX expirado";
    }
  }
  if (type === "ORDER_CREATED" && !manual && !isAwaitingStatus(o.status)) return `Pedido não está aguardando pagamento (${o.status})`;
  // Acesso (confirmação/reenvio) NUNCA sai sem pagamento confirmado
  if ((type === "PURCHASE_CONFIRMATION" || type === "ACCESS_RESEND") && !isPaidStatus(o.status)) return "Pedido não está pago — o acesso só é enviado após a confirmação";
  return null;
}

export async function scheduleEmail(orderId: string, type: EmailType, toEmail: string, delayMinutes: number) {
  const existing = await db.emailEvent.findFirst({ where: { orderId, type, triggeredBy: "system", status: { in: ["SCHEDULED", "SENDING", "SENT"] } } });
  if (existing) return existing; // proteção contra duplicidade: um envio automático por tipo/pedido
  return db.emailEvent.create({ data: { orderId, type, toEmail, scheduledFor: new Date(Date.now() + delayMinutes * 60_000) } });
}

export async function cancelScheduled(orderId: string, type: EmailType, reason: string) {
  await db.emailEvent.updateMany({ where: { orderId, type, status: "SCHEDULED" }, data: { status: "CANCELLED", error: reason } });
}

const SENT_EVENT: Record<EmailType, "email_order_sent" | "email_confirmation_sent" | "email_recovery_sent" | "email_access_sent"> = {
  ORDER_CREATED: "email_order_sent",
  PURCHASE_CONFIRMATION: "email_confirmation_sent",
  PIX_RECOVERY: "email_recovery_sent",
  ACCESS_RESEND: "email_access_sent",
};

/** Envia um EmailEvent (reserva atômica: nunca envia duas vezes o mesmo registro). Retentativas: até 3, a cada 5 min. */
export async function sendEmailEvent(id: string, opts: { manual?: boolean } = {}) {
  const claimed = await db.emailEvent.updateMany({ where: { id, status: { in: ["SCHEDULED", "FAILED"] } }, data: { status: "SENDING", attempts: { increment: 1 } } });
  if (!claimed.count) return { ok: false as const, error: "E-mail já processado" };
  const ev = await db.emailEvent.findUniqueOrThrow({ where: { id } });
  const order = await loadOrder(ev.orderId);
  if (!order) {
    await db.emailEvent.update({ where: { id }, data: { status: "SKIPPED", error: "Pedido não encontrado" } });
    return { ok: false as const, error: "Pedido não encontrado" };
  }
  const reason = eligibility(ev.type, order, Boolean(opts.manual));
  if (reason) {
    await db.emailEvent.update({ where: { id }, data: { status: "SKIPPED", error: reason } });
    return { ok: false as const, error: reason };
  }
  const s = await getSettingsFresh();
  const { subject, html, text, headers } = renderEmail(ev.type, order, s);
  const result = await deliver({ to: ev.toEmail, subject, html, text, headers, idempotencyKey: `adf-email-${ev.id}` }, s.contact_email || null);
  if (result.ok) {
    await db.emailEvent.update({ where: { id }, data: { status: "SENT", sentAt: new Date(), subject, providerMessageId: result.id, error: null } });
    await trackServerEvent(order, SENT_EVENT[ev.type]);
    log.info("email", "enviado", { type: ev.type, order: order.orderNumber });
    return { ok: true as const };
  }
  const giveUp = !result.retryable || ev.attempts >= 3;
  await db.emailEvent.update({ where: { id }, data: { status: giveUp ? "FAILED" : "SCHEDULED", error: result.error, subject, scheduledFor: new Date(Date.now() + 5 * 60_000) } });
  log.error("email", "falha no envio", { type: ev.type, order: order.orderNumber, error: result.error });
  return { ok: false as const, error: result.error };
}

async function sendNow(orderId: string, type: EmailType, triggeredBy: string, manual = false) {
  const order = await loadOrder(orderId);
  if (!order) return { ok: false as const, error: "Pedido não encontrado" };
  const ev = await db.emailEvent.create({ data: { orderId, type, toEmail: order.customer.email, triggeredBy } });
  return sendEmailEvent(ev.id, { manual });
}

/** Pagamento confirmado → e-mail com o acesso (e cancela o lembrete de PIX). */
export async function onOrderPaidEmail(orderId: string, email: string) {
  await cancelScheduled(orderId, "PIX_RECOVERY", "Pedido pago");
  await cancelScheduled(orderId, "ORDER_CREATED", "Pedido pago");
  const s = await getSettingsFresh();
  if (!isOn(s.email_confirmation_enabled)) return;
  const ev = await scheduleEmail(orderId, "PURCHASE_CONFIRMATION", email, 0);
  if (ev.status === "SCHEDULED" && emailProvider() !== "none") await sendEmailEvent(ev.id).catch(() => null);
}

/** PIX gerado → confirmação do pedido (imediata) + lembrete (padrão 15 min, cancelado se pagar). */
export async function onPixGeneratedEmail(orderId: string, email: string) {
  const s = await getSettingsFresh();
  if (isOn(s.email_order_enabled)) {
    const ev = await scheduleEmail(orderId, "ORDER_CREATED", email, 0);
    if (ev.status === "SCHEDULED" && emailProvider() !== "none") await sendEmailEvent(ev.id).catch(() => null);
  }
  if (isOn(s.email_recovery_enabled)) await scheduleEmail(orderId, "PIX_RECOVERY", email, Math.max(1, settingInt(s, "email_recovery_delay_minutes", 15)));
}

/** Reenvio manual pelo admin (anti-spam: 2 min entre envios do mesmo tipo). */
export async function resendEmail(orderId: string, type: EmailType, adminId: string) {
  const recent = await db.emailEvent.findFirst({ where: { orderId, type, status: { in: ["SENT", "SENDING"] }, updatedAt: { gte: new Date(Date.now() - 2 * 60_000) } } });
  if (recent) return { ok: false as const, error: "Este e-mail foi enviado há menos de 2 minutos. Aguarde para reenviar." };
  if (emailProvider() === "none") return { ok: false as const, error: "E-mail não configurado: defina RESEND_API_KEY e EMAIL_FROM na Vercel." };
  return sendNow(orderId, type, `admin:${adminId}`, true);
}

/**
 * Reenvio de acesso pedido pela cliente (página /acesso): envia o link dos pedidos PAGOS daquele e-mail.
 * Resposta sempre genérica para quem pede (não revela se o e-mail tem compras). Anti-spam: 1 envio por pedido a cada 10 min.
 */
export async function requestAccessResend(emailRaw: string) {
  const email = emailRaw.trim().toLowerCase();
  if (emailProvider() === "none") return { sent: 0, disabled: true };
  const orders = await db.order.findMany({ where: { customer: { email }, status: { in: ["PAID", "CREDIARIO_APROVADO"] } }, orderBy: { paidAt: "desc" }, take: 5, select: { id: true } });
  let sent = 0;
  for (const o of orders) {
    const recent = await db.emailEvent.findFirst({ where: { orderId: o.id, type: "ACCESS_RESEND", createdAt: { gte: new Date(Date.now() - 10 * 60_000) } } });
    if (recent) continue;
    const r = await sendNow(o.id, "ACCESS_RESEND", "customer");
    if (r.ok) sent++;
  }
  return { sent, disabled: false };
}

/** Processa e-mails agendados vencidos (jobs/cron e execução oportunista). */
export async function processDueEmails(limit = 25) {
  if (emailProvider() === "none") return { processed: 0, sent: 0, skipped: 0, disabled: true };
  await db.emailEvent.updateMany({ where: { status: "SENDING", updatedAt: { lt: new Date(Date.now() - 10 * 60_000) } }, data: { status: "SCHEDULED" } });
  const due = await db.emailEvent.findMany({ where: { status: "SCHEDULED", scheduledFor: { lte: new Date() } }, orderBy: { scheduledFor: "asc" }, take: limit, select: { id: true } });
  let sent = 0;
  let skipped = 0;
  for (const e of due) {
    const r = await sendEmailEvent(e.id);
    if (r.ok) sent++;
    else skipped++;
  }
  const leads = await processDueLeadEmails(limit);
  return { processed: due.length, sent, skipped, leads };
}

// ───────────── Resultado do quiz e suporte (sem pedido) ─────────────

export async function sendQuizResultEmail(to: string, data: { firstName: string | null; title: string; body: string | null; points: string[]; disclaimer: string; ctaLabel: string; ctaTarget: string }) {
  const s = await getSettingsFresh();
  if (!isOn(s.email_quiz_result_enabled) || emailProvider() === "none") return { ok: false as const, error: "desativado" };
  const tpl = quizResultEmail(brandFromSettings(s), data, abs(data.ctaTarget || "/"), data.ctaLabel);
  const r = await deliver({ to, ...tpl }, s.contact_email || null);
  if (!r.ok) log.error("email", "falha no resultado do quiz", { error: r.error });
  return r.ok ? { ok: true as const } : { ok: false as const, error: r.error };
}

export async function sendSupportEmails(m: { id: string; name: string; email: string; orderNumber: string | null; subject: string; message: string }) {
  const s = await getSettingsFresh();
  const inbox = s.support_email || s.contact_email;
  if (emailProvider() === "none" || !inbox) return { ok: false as const, error: emailProvider() === "none" ? "E-mail não configurado" : "E-mail de suporte não definido em Configurações" };
  const b = brandFromSettings(s);
  const notify = await deliver({ to: inbox, ...supportNotificationEmail(b, m), idempotencyKey: `adf-support-${m.id}` }, m.email);
  if (notify.ok) await deliver({ to: m.email, ...supportAckEmail(b, m), idempotencyKey: `adf-support-ack-${m.id}` }, inbox).catch(() => null);
  return notify.ok ? { ok: true as const } : { ok: false as const, error: notify.error };
}

// ───────────── Checkout abandonado (lead sem pedido) — desligado por padrão ─────────────

type Lead = NonNullable<Awaited<ReturnType<typeof db.checkoutLead.findUnique>>>;

export function renderLeadEmail(lead: Lead, s: Settings) {
  const unsub = leadUnsubscribeUrl(lead.token);
  const tpl = checkoutRecoveryEmail(
    brandFromSettings(s),
    { firstName: lead.name?.split(/\s+/)[0] ?? null, lines: (lead.itemsSummary ?? "").split(", ").filter(Boolean), totalCents: lead.totalCents },
    leadRecoveryUrl(lead.token),
    textsFor(s, "checkout"),
    unsub
  );
  return { ...tpl, headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } };
}

async function leadIneligible(lead: Lead, manual: boolean): Promise<string | null> {
  if (!lead.email) return "Sem e-mail";
  if (lead.orderId) return "Já virou pedido";
  const optedOut =
    lead.emailOptOut ||
    (await db.checkoutLead.count({ where: { email: lead.email, emailOptOut: true } })) > 0 ||
    (await db.customer.count({ where: { email: lead.email, emailOptOutAt: { not: null } } })) > 0;
  if (optedOut) return "Pessoa descadastrou dos lembretes";
  if (!manual) {
    if (Date.now() - lead.createdAt.getTime() > 72 * 3600_000) return "Checkout antigo (mais de 72h)";
    const ordered = await db.order.count({ where: { customer: { email: lead.email }, createdAt: { gte: lead.createdAt } } });
    if (ordered) return "Cliente gerou um pedido depois";
  }
  return null;
}

export async function sendLeadEmail(id: string, opts: { manual?: boolean } = {}) {
  const claimed = await db.checkoutLead.updateMany({
    where: { id, ...(opts.manual ? { NOT: { emailStatus: "SENDING" } } : { emailStatus: { in: ["SCHEDULED", "FAILED"] } }) },
    data: { emailStatus: "SENDING", emailAttempts: { increment: 1 } },
  });
  if (!claimed.count) return { ok: false as const, error: "E-mail já processado" };
  const lead = await db.checkoutLead.findUniqueOrThrow({ where: { id } });
  const reason = await leadIneligible(lead, Boolean(opts.manual));
  if (reason) {
    await db.checkoutLead.update({ where: { id }, data: { emailStatus: "SKIPPED", emailError: reason } });
    return { ok: false as const, error: reason };
  }
  const s = await getSettingsFresh();
  const { subject, html, text, headers } = renderLeadEmail(lead, s);
  const result = await deliver({ to: lead.email!, subject, html, text, headers, idempotencyKey: `adf-lead-${lead.id}-${lead.emailCount + 1}` }, s.contact_email || null);
  if (result.ok) {
    await db.checkoutLead.update({ where: { id }, data: { emailStatus: "SENT", emailSentAt: new Date(), emailCount: { increment: 1 }, emailError: null } });
    log.info("email", "checkout abandonado enviado", { lead: lead.id });
    return { ok: true as const };
  }
  const giveUp = opts.manual || !result.retryable || lead.emailAttempts >= 3;
  await db.checkoutLead.update({ where: { id }, data: { emailStatus: giveUp ? "FAILED" : "SCHEDULED", emailError: result.error, emailScheduledFor: new Date(Date.now() + 5 * 60_000) } });
  return { ok: false as const, error: result.error };
}

export async function resendLeadEmail(id: string) {
  if (emailProvider() === "none") return { ok: false as const, error: "E-mail não configurado: defina RESEND_API_KEY e EMAIL_FROM na Vercel." };
  const lead = await db.checkoutLead.findUnique({ where: { id } });
  if (!lead) return { ok: false as const, error: "Checkout não encontrado" };
  if (lead.emailSentAt && Date.now() - lead.emailSentAt.getTime() < 2 * 60_000) return { ok: false as const, error: "E-mail enviado há menos de 2 minutos. Aguarde para reenviar." };
  return sendLeadEmail(id, { manual: true });
}

export async function processDueLeadEmails(limit = 25) {
  if (emailProvider() === "none") return { processed: 0, sent: 0 };
  await db.checkoutLead.updateMany({ where: { emailStatus: "SENDING", updatedAt: { lt: new Date(Date.now() - 10 * 60_000) } }, data: { emailStatus: "SCHEDULED" } });
  const due = await db.checkoutLead.findMany({ where: { emailStatus: "SCHEDULED", emailScheduledFor: { lte: new Date() } }, orderBy: { emailScheduledFor: "asc" }, take: limit, select: { id: true } });
  let sent = 0;
  for (const l of due) if ((await sendLeadEmail(l.id)).ok) sent++;
  return { processed: due.length, sent };
}

// ───────────── Prévia e teste (admin) ─────────────

export type PreviewKind = "order" | "confirmation" | "upsell" | "recovery" | "access" | "checkout" | "quiz";

export async function renderPreview(kind: PreviewKind, s?: Settings) {
  const { sampleOrder } = await import("@/emails/sample");
  const settings = s ?? (await getSettingsFresh());
  const b = brandFromSettings(settings);
  const o = sampleOrder();
  const base = siteUrl();
  const url = `${base}/pedido/exemplo`;
  if (kind === "order") return orderCreatedEmail(b, { ...o, pixExpired: false }, url, textsFor(settings, "ORDER_CREATED"));
  if (kind === "recovery") return pixRecoveryEmail(b, { ...o, pixExpired: false }, url, textsFor(settings, "PIX_RECOVERY"), `${base}/api/email/unsubscribe`);
  if (kind === "access") return accessResendEmail(b, o, url, textsFor(settings, "ACCESS_RESEND"));
  if (kind === "checkout") return checkoutRecoveryEmail(b, { firstName: o.firstName, lines: o.items.map((i) => i.name), totalCents: o.totalCents }, `${base}/checkout`, textsFor(settings, "checkout"), `${base}/api/email/unsubscribe`);
  if (kind === "quiz")
    return quizResultEmail(b, { firstName: o.firstName, title: "Exemplo de resultado", body: "Este é um exemplo do e-mail com o resultado editorial do quiz.", points: ["Ponto educativo 1", "Ponto educativo 2"], disclaimer: "Conteúdo educativo — não substitui acompanhamento profissional." }, `${base}/`, "Conhecer o Além da Fome");
  const t = textsFor(settings, "PURCHASE_CONFIRMATION");
  if (kind === "upsell") return purchaseConfirmationEmail(b, { ...o, isUpsell: true }, url, { ...t, subject: settings.email_upsell_subject || t.subject, title: settings.email_upsell_title || t.title, text: settings.email_upsell_text || t.text });
  return purchaseConfirmationEmail(b, o, url, t);
}

export async function sendTestEmail(kind: PreviewKind, to: string) {
  if (emailProvider() === "none") return { ok: false as const, error: "E-mail não configurado: defina RESEND_API_KEY e EMAIL_FROM na Vercel." };
  const s = await getSettingsFresh();
  const e = await renderPreview(kind, s);
  const r = await deliver({ to, subject: `[TESTE] ${e.subject}`, html: e.html, text: e.text }, s.contact_email || null);
  return r.ok ? { ok: true as const } : { ok: false as const, error: r.error };
}
