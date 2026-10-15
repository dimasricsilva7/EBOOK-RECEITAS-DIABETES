"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { bravopayMode, isProductionDeploy } from "@/lib/env";
import { signWebhookPayload } from "@/lib/payments/bravopay";
import { CREDIARIO_STATUSES, isAwaitingStatus, isPaidStatus, ORDER_STATUS_LABEL, type CrediarioStatus } from "@/lib/domain";
import { withAdmin, type ActionResult } from "@/server/admin/guard";
import { optStr, str } from "@/server/admin/forms";
import { logOrderEvent, revokeOrderAccess, syncOrder, updateCrediarioStatus } from "@/server/orders";
import { randomToken } from "@/lib/crypto";
import { handleBravopayWebhook } from "@/server/webhooks";
import { EMAIL_TYPE_LABEL, resendEmail } from "@/lib/email";
import { decryptField } from "@/lib/crypto";
import { formatProtocol, maskCpfLast } from "@/lib/crediario";
import type { EmailType } from "@prisma/client";

/** Observações internas do pedido (não aparecem para a cliente). */
export async function saveOrderNotes(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return withAdmin("EDITOR", async (admin) => {
    const id = str(fd, "id", 40);
    const order = await db.order.findUniqueOrThrow({ where: { id } });
    const notes = optStr(fd, "notes", 2000);
    await db.order.update({ where: { id }, data: { notes } });
    await audit(admin.id, "order_updated", "order", id, { summary: `Observações do pedido ${order.orderNumber} atualizadas`, before: { notes: order.notes }, after: { notes } });
    revalidatePath(`/admin/pedidos/${id}`);
    return { ok: true, message: "Observações salvas." };
  });
}

/** Acesso digital: revogar (ex.: reembolso feito fora do sistema) ou liberar de novo um acesso revogado. Só pedidos pagos. */
export async function setOrderAccess(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return withAdmin("ADMIN", async (admin) => {
    const id = str(fd, "id", 40);
    const mode = str(fd, "mode", 10);
    const order = await db.order.findUniqueOrThrow({ where: { id }, include: { items: { include: { digitalAccess: true, product: { select: { digitalMaxDownloads: true, digitalValidityDays: true } } } } } });
    if (mode === "revoke") {
      const n = await revokeOrderAccess(id, `revogado pelo admin ${admin.email}`);
      await audit(admin.id, "access_revoked", "order", id, { summary: `Acesso do pedido ${order.orderNumber} revogado (${n} item(ns))` });
      revalidatePath(`/admin/pedidos/${id}`);
      return { ok: true, message: n ? "Acesso revogado." : "Não havia acesso ativo." };
    }
    if (!isPaidStatus(order.status)) return { error: "O acesso só pode ser liberado para pedidos com pagamento confirmado." };
    let n = 0;
    for (const item of order.items) {
      const active = item.digitalAccess.find((a) => !a.revokedAt);
      if (active) continue;
      const days = item.product?.digitalValidityDays;
      await db.digitalAccess.create({ data: { orderItemId: item.id, token: randomToken(24), maxDownloads: item.product?.digitalMaxDownloads ?? null, expiresAt: days ? new Date(Date.now() + days * 86_400_000) : null } });
      n++;
    }
    if (n) await logOrderEvent(id, "access_granted", `Acesso liberado novamente pelo admin (${n} item(ns))`, undefined, "DELIVERED");
    await audit(admin.id, "access_granted", "order", id, { summary: `Acesso do pedido ${order.orderNumber} liberado (${n} item(ns))` });
    revalidatePath(`/admin/pedidos/${id}`);
    return { ok: true, message: n ? "Acesso liberado. Reenvie o e-mail de acesso se necessário." : "Todos os itens já têm acesso ativo." };
  });
}

/** Registra um reembolso feito no painel do gateway: pedido → Reembolsado e acesso revogado. */
export async function markRefunded(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return withAdmin("ADMIN", async (admin) => {
    const id = str(fd, "id", 40);
    const order = await db.order.findUniqueOrThrow({ where: { id } });
    if (!isPaidStatus(order.status)) return { error: "Somente pedidos pagos podem ser marcados como reembolsados." };
    if (str(fd, "confirm", 20).toUpperCase() !== "REEMBOLSO") return { error: 'Digite "REEMBOLSO" para confirmar.' };
    const moved = await db.order.updateMany({ where: { id, status: order.status }, data: { status: "REFUNDED", paymentStatus: "REFUNDED", refundedAt: new Date() } });
    if (!moved.count) return { error: "O status do pedido mudou. Recarregue a página." };
    await logOrderEvent(id, "status_change", `${order.status} → REFUNDED (registrado pelo admin ${admin.email})`, undefined, "REFUNDED");
    await revokeOrderAccess(id, "Pedido reembolsado");
    await audit(admin.id, "order_refunded", "order", id, { summary: `Pedido ${order.orderNumber} marcado como reembolsado`, before: { status: order.status }, after: { status: "REFUNDED" } });
    revalidatePath(`/admin/pedidos/${id}`);
    return { ok: true, message: "Pedido marcado como reembolsado e acesso revogado. Faça o estorno no painel do gateway, se ainda não fez." };
  });
}

export async function cancelOrder(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return withAdmin("ADMIN", async (admin) => {
  const id = str(fd, "id", 40);
  const order = await db.order.findUniqueOrThrow({ where: { id } });
  if (!isAwaitingStatus(order.status)) return { error: "Somente pedidos aguardando pagamento podem ser cancelados aqui. Reembolsos são feitos no painel BravoPay." };
  const moved = await db.order.updateMany({ where: { id, status: order.status }, data: { status: "CANCELLED", cancelledAt: new Date() } });
  if (!moved.count) return { error: "O status do pedido mudou. Recarregue a página." };
  await logOrderEvent(id, "status_change", `${order.status} → CANCELLED (admin ${admin.email})`, undefined, "CANCELLED");
  await audit(admin.id, "order_cancelled", "order", id, { summary: `Pedido ${order.orderNumber} cancelado`, before: { status: order.status }, after: { status: "CANCELLED" } });
  revalidatePath(`/admin/pedidos/${id}`);
  return { ok: true, message: "Pedido cancelado." };
  });
}

/** Consulta o status real na BravoPay (não altera nada se o gateway não confirmar). */
export async function recheckPayment(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return withAdmin("EDITOR", async (admin) => {
  const id = str(fd, "id", 40);
  const order = await db.order.findUniqueOrThrow({ where: { id } });
  const after = await syncOrder(order, { minIntervalMs: 0, source: "admin" });
  await audit(admin.id, "order_rechecked", "order", id, { summary: `Consulta ao gateway: ${order.orderNumber} (${order.status} → ${after.status})` });
  revalidatePath(`/admin/pedidos/${id}`);
  return { ok: true, message: after.status === order.status ? "Consulta feita — sem mudança de status." : `Status atualizado: ${ORDER_STATUS_LABEL[after.status]}.` };
  });
}

/**
 * SOMENTE em desenvolvimento/modo mock: envia um webhook assinado "transaction.paid"
 * pelo mesmo caminho de produção (validação de assinatura + idempotência).
 */
export async function simulatePayment(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return withAdmin("ADMIN", async (admin) => {
  if (isProductionDeploy() || bravopayMode() !== "mock") return { error: "Disponível apenas no modo de teste (BRAVOPAY_MODE=mock)." };
  const secret = process.env.BRAVOPAY_WEBHOOK_SECRET;
  if (!secret) return { error: "Defina BRAVOPAY_WEBHOOK_SECRET para simular o webhook." };
  const order = await db.order.findUniqueOrThrow({ where: { id: str(fd, "id", 40) } });
  if (!order.transactionId) return { error: "Pedido sem PIX gerado." };
  const body = JSON.stringify({
    id: `evt_sim_${order.id}_${Date.now()}`,
    type: "transaction.paid",
    created: Math.floor(Date.now() / 1000),
    data: { id: order.transactionId, status: "PAID", method: "PIX", amount_cents: order.totalCents, fee_cents: null, net_cents: null, external_reference: order.externalReference, paid_at: new Date().toISOString() },
  });
  const headers = new Headers({ "bravopay-signature": signWebhookPayload(body, secret) });
  const result = await handleBravopayWebhook(body, headers);
  await audit(admin.id, "payment_simulated", "order", order.id, { summary: `Pagamento simulado (modo teste) ${order.orderNumber}` });
  revalidatePath(`/admin/pedidos/${order.id}`);
  return result.status === 200 ? { ok: true, message: "Webhook simulado processado." } : { error: `Falha: ${JSON.stringify(result.body)}` };
  });
}

/** Reenvio manual de e-mail pelo admin (pedido, acesso, lembrete de PIX). */
export async function resendEmailAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return withAdmin("EDITOR", async (admin) => {
    const id = str(fd, "id", 40);
    const type = str(fd, "type", 30) as EmailType;
    if (!(type in EMAIL_TYPE_LABEL)) return { error: "Tipo de e-mail inválido." };
    const order = await db.order.findUniqueOrThrow({ where: { id }, include: { customer: { select: { email: true } } } });
    const r = await resendEmail(id, type, admin.id);
    await audit(admin.id, "email_resent", "order", id, { summary: `${EMAIL_TYPE_LABEL[type]} — pedido ${order.orderNumber} para ${order.customer.email}: ${r.ok ? "enviado" : r.error}` });
    revalidatePath(`/admin/pedidos/${id}`);
    return r.ok ? { ok: true, message: `${EMAIL_TYPE_LABEL[type]} enviado para ${order.customer.email}.` } : { error: r.error };
  });
}

/** Reenvio rápido pela lista: escolhe o e-mail certo pelo status do pedido. */
export async function quickResendEmail(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return withAdmin("EDITOR", async (admin) => {
    const id = str(fd, "id", 40);
    const order = await db.order.findUniqueOrThrow({ where: { id }, include: { customer: { select: { email: true } } } });
    const type: EmailType = isPaidStatus(order.status) ? "ACCESS_RESEND" : "PIX_RECOVERY";
    const r = await resendEmail(id, type, admin.id);
    await audit(admin.id, "email_resent", "order", id, { summary: `${EMAIL_TYPE_LABEL[type]} — pedido ${order.orderNumber} para ${order.customer.email}: ${r.ok ? "enviado" : r.error}` });
    revalidatePath("/admin/pedidos");
    return r.ok ? { ok: true, message: `${EMAIL_TYPE_LABEL[type]} enviado.` } : { error: r.error };
  });
}

/** Exclui o pedido (e itens, pagamentos, eventos e e-mails dele). Fica registrado na auditoria. */
export async function deleteOrder(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return withAdmin("ADMIN", async (admin) => {
    const id = str(fd, "id", 40);
    const order = await db.order.findUnique({ where: { id }, include: { customer: { select: { name: true, email: true } }, items: { select: { productName: true, quantity: true } } } });
    if (!order) return { error: "Pedido não encontrado." };
    await db.order.delete({ where: { id } });
    await audit(admin.id, "order_deleted", "order", id, {
      summary: `Pedido ${order.orderNumber} excluído (${ORDER_STATUS_LABEL[order.status]}, ${order.customer.email})`,
      before: { orderNumber: order.orderNumber, status: order.status, totalCents: order.totalCents, customer: order.customer.email, items: order.items.map((i) => `${i.quantity}x ${i.productName}`), createdAt: order.createdAt.toISOString() },
    });
    revalidatePath("/admin/pedidos");
    revalidatePath("/admin");
    if (str(fd, "back", 10) === "1") redirect("/admin/pedidos");
    return { ok: true, message: `Pedido ${order.orderNumber} excluído.` };
  });
}

/** Crediário: muda o status da análise (pendente → análise → aprovado/recusado/cancelado). */
export async function updateCrediarioStatusAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return withAdmin("EDITOR", async (admin) => {
    const id = str(fd, "id", 40);
    const next = str(fd, "status", 30) as CrediarioStatus;
    if (!(CREDIARIO_STATUSES as readonly string[]).includes(next)) return { error: "Status inválido." };
    const before = await db.order.findUniqueOrThrow({ where: { id }, select: { status: true, orderNumber: true } });
    const { order } = await updateCrediarioStatus(id, next, `admin ${admin.email}`, optStr(fd, "note", 1000));
    await audit(admin.id, "crediario_status_changed", "order", id, { summary: `Pedido ${order.orderNumber}: ${ORDER_STATUS_LABEL[before.status]} → ${ORDER_STATUS_LABEL[next]}`, before: { status: before.status }, after: { status: next } });
    revalidatePath(`/admin/pedidos/${id}`);
    return { ok: true, message: `Status atualizado: ${ORDER_STATUS_LABEL[next]}.` };
  });
}

/** Revela o protocolo completo do crediário (só admin; a visualização fica registrada na auditoria). */
export async function revealCrediarioData(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return withAdmin("ADMIN", async (admin) => {
    const id = str(fd, "id", 40);
    const c = await db.crediarioData.findUnique({ where: { orderId: id }, include: { order: { select: { orderNumber: true } } } });
    if (!c) return { error: "Este pedido não tem dados de crediário." };
    const protocol = decryptField(c.protocolEnc);
    const validity = decryptField(c.validityEnc);
    const cpf = decryptField(c.cpfLast3Enc);
    await audit(admin.id, "crediario_data_viewed", "order", id, { summary: `Protocolo do pedido ${c.order.orderNumber} visualizado` });
    return { ok: true, message: `Protocolo: ${protocol ? formatProtocol(protocol) : "—"} · Validade: ${validity ?? "—"} · CPF: ${cpf ? maskCpfLast(cpf) : "—"}` };
  });
}
