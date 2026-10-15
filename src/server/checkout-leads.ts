import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { randomToken } from "@/lib/crypto";
import { log } from "@/lib/log";
import { siteUrl } from "@/lib/env";
import { parseUserAgent } from "@/utils/channel";
import { onlyDigits } from "@/utils/validators";
import { quoteCart } from "@/server/cart";
import { getSettingsFresh, isOn, settingInt } from "@/server/settings";
import type { CheckoutLeadInput } from "@/lib/validation";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const validLeadEmail = (v: string | null | undefined) => !!v && EMAIL_RE.test(v.trim());

export const leadRecoveryUrl = (token: string) => `${siteUrl()}/checkout?recuperar=${encodeURIComponent(token)}`;
export const leadUnsubscribeUrl = (token: string) => `${siteUrl()}/api/email/unsubscribe?lead=${encodeURIComponent(token)}`;

/**
 * Registra/atualiza o lead do checkout. Só grava quando há um contato útil
 * (e-mail válido ou WhatsApp com DDD). Agenda o e-mail de checkout abandonado.
 */
export async function upsertCheckoutLead(input: CheckoutLeadInput, meta: { userAgent: string | null; visitorId?: string | null }) {
  const email = validLeadEmail(input.email) ? input.email!.trim().toLowerCase() : null;
  const phone = onlyDigits(input.phone ?? "");
  const name = input.name?.trim() || null;
  if (!email && phone.length < 10) return null;

  const existing = await db.checkoutLead.findUnique({ where: { clientKey: input.clientKey } });
  if (existing?.orderId) return existing; // já virou pedido

  const quote = await quoteCart({ items: input.items, bumpIds: input.bumpIds, couponCode: input.couponCode, visitorId: meta.visitorId ?? input.context?.visitorId });
  const itemsSummary = quote.lines.map((l) => `${l.name}`).join(", ").slice(0, 500);
  const last = input.context?.attribution?.last;

  const s = await getSettingsFresh();
  const delay = Math.max(1, settingInt(s, "email_checkout_delay_minutes", 60));
  // Reagenda enquanto a pessoa ainda está preenchendo (conta a partir da última atividade)
  const schedule =
    email && isOn(s.email_checkout_enabled) && (!existing || existing.emailStatus === null || existing.emailStatus === "SCHEDULED")
      ? { emailStatus: "SCHEDULED" as const, emailScheduledFor: new Date(Date.now() + delay * 60_000) }
      : {};

  const data = {
    name,
    email,
    phone: phone || null,
    items: input.items as unknown as Prisma.InputJsonValue,
    bumpIds: input.bumpIds as unknown as Prisma.InputJsonValue,
    couponCode: input.couponCode ?? null,
    quizSessionId: input.quizSessionId ?? null,
    itemsSummary,
    totalCents: quote.totalCents,
    ...schedule,
  };
  return existing
    ? db.checkoutLead.update({ where: { id: existing.id }, data })
    : db.checkoutLead
        .create({
          data: {
            ...data,
            clientKey: input.clientKey,
            token: randomToken(24),
            sessionId: input.context?.sessionId ?? null,
            visitorId: meta.visitorId ?? input.context?.visitorId ?? null,
            utmSource: last?.source ?? input.context?.attribution?.first?.source ?? null,
            utmCampaign: last?.campaign ?? input.context?.attribution?.first?.campaign ?? null,
            device: parseUserAgent(meta.userAgent).device,
          },
        })
        .catch(async (e) => {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return db.checkoutLead.findUnique({ where: { clientKey: input.clientKey } });
          throw e;
        });
}

/** Pedido criado → o lead converteu: cancela o e-mail de checkout abandonado. */
export async function linkLeadToOrder(leadKey: string | null | undefined, orderId: string, email: string) {
  if (leadKey) {
    const lead = await db.checkoutLead.findUnique({ where: { clientKey: leadKey } }).catch(() => null);
    if (lead && !lead.orderId)
      await db.checkoutLead
        .update({ where: { id: lead.id }, data: { orderId, email, ...(lead.emailStatus === "SCHEDULED" ? { emailStatus: "CANCELLED", emailError: "Virou pedido" } : {}) } })
        .catch(() => null); // orderId único: se outro pedido já usou este lead, ignora
  }
  // Outros checkouts abertos do mesmo e-mail também não precisam do lembrete
  await db.checkoutLead.updateMany({ where: { email, orderId: null, emailStatus: "SCHEDULED" }, data: { emailStatus: "CANCELLED", emailError: "Cliente gerou um pedido" } }).catch(() => null);
}

/** Restaura carrinho + contato a partir do link do e-mail. */
export async function findLeadByToken(token: string | null | undefined) {
  if (!token || token.length < 16 || token.length > 64) return null;
  return db.checkoutLead.findUnique({ where: { token } });
}

export function logLeadError(message: string, err: unknown) {
  log.error("checkout-lead", message, { error: err instanceof Error ? err.message : String(err) });
}
