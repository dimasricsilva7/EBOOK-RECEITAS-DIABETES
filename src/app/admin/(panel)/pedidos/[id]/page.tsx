import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, Field, PageHeader, ORDER_TONE, inputCls, textareaCls, btnSecondary } from "@/components/admin/ui";
import { ActionForm, ConfirmAction, SubmitButton } from "@/components/admin/client";
import { CREDIARIO_TRANSITIONS, ORDER_STATUS_LABEL, isAwaitingStatus, isCrediarioStatus, isPaidStatus, type CrediarioStatus } from "@/lib/domain";
import { bravopayMode, isProductionDeploy, siteUrl } from "@/lib/env";
import { db } from "@/lib/db";
import { formatBRL, formatCpf, formatDate, formatPhone } from "@/utils/format";
import { cancelOrder, deleteOrder, markRefunded, recheckPayment, resendEmailAction, saveOrderNotes, setOrderAccess, simulatePayment, updateCrediarioStatusAction } from "../actions";
import { decryptField } from "@/lib/crypto";
import { formatProtocol } from "@/lib/crediario";
import { EMAIL_TYPE_LABEL } from "@/lib/email";
import { emailProvider } from "@/lib/email/provider";

export const metadata = { title: "Pedido" };

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await db.order.findUnique({
    where: { id },
    include: {
      customer: true,
      items: { include: { digitalAccess: true } },
      payments: true,
      paymentEvents: { orderBy: { createdAt: "asc" } },
      upsellOrders: { select: { id: true, orderNumber: true, status: true, totalCents: true } },
      parentOrder: { select: { id: true, orderNumber: true } },
      upsellEvents: { include: { upsell: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
      emailEvents: { orderBy: { createdAt: "desc" } },
      crediario: true,
      quizSessions: { select: { id: true, resultKey: true, completedAt: true } },
    },
  });
  if (!order) notFound();
  const [webhooks, events] = await Promise.all([
    db.webhookEvent.findMany({ where: { OR: [{ orderId: order.id }, ...(order.transactionId ? [{ transactionId: order.transactionId }] : [])] }, orderBy: { receivedAt: "asc" } }),
    order.sessionId ? db.analyticsEvent.findMany({ where: { sessionId: order.sessionId }, orderBy: { createdAt: "asc" }, take: 150, select: { id: true, name: true, element: true, path: true, createdAt: true, valueCents: true } }) : Promise.resolve([]),
  ]);
  const snap = order.customerSnapshot as { name?: string; cpf?: string | null };
  const mock = bravopayMode() === "mock" && !isProductionDeploy();

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Pedido ${order.orderNumber}`}
        description={`Criado em ${formatDate(order.createdAt, true)}${order.source === "UPSELL" ? " · pedido complementar (upsell)" : ""}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={ORDER_TONE[order.status] ?? "slate"}>{ORDER_STATUS_LABEL[order.status]}</Badge>
            <a href="#emails" className={btnSecondary}>Reenviar e-mail</a>
            <ConfirmAction action={deleteOrder} label="Excluir pedido" confirmLabel="Excluir definitivamente" danger description={`O pedido ${order.orderNumber} será apagado com itens, pagamentos, eventos e e-mails. Use para pedidos de teste ou duplicados. A exclusão fica registrada na auditoria.`} hidden={{ id: order.id, back: "1" }} />
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Card title="Itens (snapshot da compra)">
            <ul className="divide-y divide-slate-100 text-sm">
              {order.items.map((i) => (
                <li key={i.id} className="flex justify-between gap-4 py-2.5">
                  <div>
                    <p className="font-medium">{i.quantity}× {i.productName} {i.kind !== "PRODUCT" && <Badge tone="blue">{i.kind === "ORDER_BUMP" ? "order bump" : i.kind === "UPSELL" ? "upsell" : "cross-sell"}</Badge>}</p>
                    <p className="text-xs text-slate-500">SKU {i.sku}{i.listPriceCents !== i.unitPriceCents ? ` · preço de tabela ${formatBRL(i.listPriceCents)}` : ""}</p>
                    {i.digitalAccess.map((a) => (
                      <p key={a.id} className={`text-xs ${a.revokedAt ? "text-red-600" : "text-emerald-700"}`}>Acesso digital {a.revokedAt ? `revogado em ${formatDate(a.revokedAt, true)}` : "ativo"} · {a.views} visita(s) à área · {a.downloads}{a.maxDownloads != null ? `/${a.maxDownloads}` : ""} acesso(s) a materiais{a.lastAccessAt ? ` · último ${formatDate(a.lastAccessAt, true)}` : ""}{a.expiresAt ? ` · expira ${formatDate(a.expiresAt)}` : ""}</p>
                    ))}
                  </div>
                  <p className="shrink-0 tabular-nums">{formatBRL(i.unitPriceCents)} · <b>{formatBRL(i.totalPriceCents)}</b></p>
                </li>
              ))}
            </ul>
            <dl className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Subtotal</dt><dd>{formatBRL(order.subtotalCents)}</dd></div>
              {order.discountCents > 0 && <div className="flex justify-between"><dt className="text-slate-500">Desconto {order.couponCode && `(${order.couponCode})`}</dt><dd>− {formatBRL(order.discountCents)}</dd></div>}
              <div className="flex justify-between font-bold"><dt>Total</dt><dd>{formatBRL(order.totalCents)}</dd></div>
              {order.paidAmountCents != null && <div className="flex justify-between text-emerald-700"><dt>Pago</dt><dd>{formatBRL(order.paidAmountCents)}{order.feeCents != null && ` · taxa ${formatBRL(order.feeCents)} · líquido ${formatBRL(order.netCents ?? 0)}`}</dd></div>}
            </dl>
          </Card>

          <Card title="Linha do tempo">
            <ol className="space-y-2 text-sm">
              {order.paymentEvents.map((e) => (
                <li key={e.id} className="flex gap-3">
                  <span className="w-32 shrink-0 text-xs text-slate-400">{formatDate(e.createdAt, true)}</span>
                  <span><b className="font-medium">{e.message}</b> <span className="text-xs text-slate-400">{e.type}</span></span>
                </li>
              ))}
            </ol>
          </Card>

          <Card title={`Webhooks (${webhooks.length})`}>
            {webhooks.length ? (
              <ul className="space-y-1 text-sm">
                {webhooks.map((w) => (
                  <li key={w.id} className="flex flex-wrap gap-2">
                    <span className="text-xs text-slate-400">{formatDate(w.receivedAt, true)}</span>
                    <b className="font-medium">{w.eventType}</b>
                    <Badge tone={w.status === "PROCESSED" ? "green" : w.status === "FAILED" ? "red" : "slate"}>{w.status}</Badge>
                    <span className="text-xs text-slate-500">{w.previousStatus} → {w.newStatus} · {w.result} · {w.attempts} tentativa(s)</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">Nenhum webhook recebido.</p>
            )}
          </Card>

          {events.length > 0 && (
            <Card title="Jornada da sessão (eventos)">
              <ol className="max-h-80 space-y-1 overflow-y-auto text-xs">
                {events.map((e) => (
                  <li key={e.id} className="flex gap-3">
                    <span className="w-28 shrink-0 text-slate-400">{formatDate(e.createdAt, true)}</span>
                    <span className="font-medium">{e.name}</span>
                    <span className="truncate text-slate-500">{e.element ?? e.path}</span>
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card title="Cliente">
            <dl className="space-y-1.5 text-sm">
              <div><dt className="inline text-slate-500">Nome: </dt><dd className="inline"><Link href={`/admin/clientes/${order.customerId}`} className="font-medium underline">{snap.name ?? order.customer.name}</Link></dd></div>
              <div><dt className="inline text-slate-500">E-mail: </dt><dd className="inline">{order.customer.email}</dd></div>
              <div><dt className="inline text-slate-500">WhatsApp: </dt><dd className="inline">{formatPhone(order.customer.phone)}</dd></div>
              {snap.cpf && <div><dt className="inline text-slate-500">CPF: </dt><dd className="inline">{formatCpf(snap.cpf)}</dd></div>}
              <div><dt className="inline text-slate-500">Opt-in marketing: </dt><dd className="inline">{order.customer.marketingConsent ? "sim" : "não"}</dd></div>
            </dl>
            {order.quizSessions.length > 0 && (
              <p className="mt-3 border-t border-slate-100 pt-3 text-sm">Veio do quiz: <Link href={`/admin/leads/${order.quizSessions[0].id}`} className="underline">ver lead</Link></p>
            )}
          </Card>

          <Card title="Pagamento">
            <dl className="space-y-1.5 text-sm">
              <div><dt className="inline text-slate-500">Método: </dt><dd className="inline">{order.paymentMethod} · {order.paymentProvider}</dd></div>
              <div><dt className="inline text-slate-500">Transação: </dt><dd className="inline break-all font-mono text-xs">{order.transactionId ?? "—"}</dd></div>
              <div><dt className="inline text-slate-500">PIX expira: </dt><dd className="inline">{order.pixExpiresAt ? formatDate(order.pixExpiresAt, true) : "—"}</dd></div>
              <div><dt className="inline text-slate-500">Pago em: </dt><dd className="inline">{order.paidAt ? formatDate(order.paidAt, true) : "—"}</dd></div>
              {order.paymentError && <div className="text-red-600">Último erro: {order.paymentError}</div>}
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              {order.transactionId && isAwaitingStatus(order.status) && (
                <ActionForm action={recheckPayment} className="contents">
                  <input type="hidden" name="id" value={order.id} />
                  <SubmitButton className={btnSecondary} pendingText="Consultando…">Consultar BravoPay</SubmitButton>
                </ActionForm>
              )}
              {isAwaitingStatus(order.status) && <ConfirmAction action={cancelOrder} label="Cancelar pedido" danger description="O PIX gerado deixará de ser considerado. Esta ação fica registrada na auditoria." hidden={{ id: order.id }} />}
              {mock && order.transactionId && isAwaitingStatus(order.status) && (
                <ConfirmAction action={simulatePayment} label="Simular pagamento (teste)" description="Envia um webhook assinado transaction.paid (somente modo de teste)." hidden={{ id: order.id }} />
              )}
            </div>
            <p className="mt-3 text-xs text-slate-500">Reembolso: faça o estorno no painel BravoPay — o webhook transaction.refunded atualiza o pedido e revoga o acesso. Se o estorno foi feito por fora, registre abaixo em Acesso digital.</p>
          </Card>

          {order.crediario && (
            <Card title="Crediário (protocolo — não é cartão)">
              <dl className="space-y-1.5 text-sm">
                <div><dt className="inline text-slate-500">Método: </dt><dd className="inline">{order.crediario.methodLabel} · {order.crediario.installmentLabel}</dd></div>
                <div><dt className="inline text-slate-500">Número do protocolo: </dt><dd className="inline select-all font-mono font-semibold">{(() => { const p = decryptField(order.crediario.protocolEnc); return p ? formatProtocol(p) : `•••• •••• •••• ${order.crediario.protocolLast4}`; })()}</dd></div>
                <div><dt className="inline text-slate-500">Validade do protocolo: </dt><dd className="inline select-all font-mono font-semibold">{decryptField(order.crediario.validityEnc) ?? "—"}</dd></div>
                <div><dt className="inline text-slate-500">Últimos dígitos do CPF: </dt><dd className="inline select-all font-mono font-semibold">{decryptField(order.crediario.cpfLast3Enc) ?? "—"}</dd></div>
                <div><dt className="inline text-slate-500">Parcelas: </dt><dd className="inline">{order.crediario.installments}x de {formatBRL(order.crediario.installmentCents)}</dd></div>
                {order.crediario.analysisNote && <div><dt className="inline text-slate-500">Observação: </dt><dd className="inline">{order.crediario.analysisNote}</dd></div>}
              </dl>
              <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">Dados informados pelo cliente no checkout, guardados com o pedido (cifrados no banco). Use para processar o crediário com a sua financeira.</p>
              {isCrediarioStatus(order.status) && (CREDIARIO_TRANSITIONS[order.status as CrediarioStatus]?.length ?? 0) > 0 && (
                <ActionForm action={updateCrediarioStatusAction} className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                  <input type="hidden" name="id" value={order.id} />
                  <Field label="Mudar status para">
                    <select name="status" defaultValue={CREDIARIO_TRANSITIONS[order.status as CrediarioStatus][0]} className={inputCls}>
                      {CREDIARIO_TRANSITIONS[order.status as CrediarioStatus].map((st) => <option key={st} value={st}>{ORDER_STATUS_LABEL[st]}</option>)}
                    </select>
                  </Field>
                  <Field label="Observação da análise (opcional)"><input name="note" className={inputCls} placeholder="Ex.: protocolo confirmado com a financeira" /></Field>
                  <SubmitButton>Atualizar crediário</SubmitButton>
                  <p className="text-xs text-slate-500">Ao aprovar, o pedido conta como pago: libera os materiais digitais e envia o e-mail de acesso.</p>
                </ActionForm>
              )}
            </Card>
          )}

          <div id="emails" className="scroll-mt-20" />
          <Card title="E-mails">
            {emailProvider() === "none" && <p className="mb-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">Envio desativado: configure RESEND_API_KEY e EMAIL_FROM na Vercel. Os e-mails ficam agendados e saem quando a chave for configurada.</p>}
            {order.emailEvents.length ? (
              <ul className="space-y-1.5 text-sm">
                {order.emailEvents.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <b className="font-medium">{EMAIL_TYPE_LABEL[e.type]}</b>
                    <Badge tone={e.status === "SENT" ? "green" : e.status === "FAILED" ? "red" : e.status === "SCHEDULED" ? "amber" : "slate"}>{e.status === "SENT" ? "enviado" : e.status === "SCHEDULED" ? "agendado" : e.status === "FAILED" ? "falhou" : e.status === "CANCELLED" ? "cancelado" : e.status === "SKIPPED" ? "não enviado" : "enviando"}</Badge>
                    <span className="text-xs text-slate-500">{e.sentAt ? formatDate(e.sentAt, true) : e.status === "SCHEDULED" ? `para ${formatDate(e.scheduledFor, true)}` : formatDate(e.updatedAt, true)}{e.triggeredBy.startsWith("admin") ? " · manual" : ""}</span>
                    {e.error && e.status !== "SENT" && <span className="w-full text-xs text-slate-500">{e.error}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">Nenhum e-mail ainda.</p>
            )}
            <ActionForm action={resendEmailAction} className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
              <input type="hidden" name="id" value={order.id} />
              <select name="type" defaultValue={isPaidStatus(order.status) ? "ACCESS_RESEND" : "PIX_RECOVERY"} className={`${inputCls} w-auto flex-1`} aria-label="Tipo de e-mail">
                {Object.entries(EMAIL_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <SubmitButton pendingText="Enviando…">Reenviar e-mail</SubmitButton>
            </ActionForm>
            <p className="mt-2 text-xs text-slate-500">
              Para: {order.customer.email} · Prévia:{" "}
              {Object.entries(EMAIL_TYPE_LABEL).map(([k, v], i) => (
                <span key={k}>{i > 0 && " · "}<a href={`/api/admin/email-preview?order=${order.id}&type=${k}`} target="_blank" className="underline">{v.split(" ")[0]}{k === "PIX_RECOVERY" ? " PIX" : ""}</a></span>
              ))}
            </p>
          </Card>

          <Card title="Acesso digital">
            <p className="text-sm text-slate-600">{isPaidStatus(order.status) ? (order.deliveredAt ? `Liberado em ${formatDate(order.deliveredAt, true)}.` : "Pagamento confirmado — acesso em liberação.") : "O acesso só é liberado com pagamento confirmado."}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {isPaidStatus(order.status) && (
                <ActionForm action={setOrderAccess} className="contents">
                  <input type="hidden" name="id" value={order.id} />
                  <input type="hidden" name="mode" value="grant" />
                  <SubmitButton className={btnSecondary} pendingText="Liberando…">Liberar acesso novamente</SubmitButton>
                </ActionForm>
              )}
              {order.items.some((i) => i.digitalAccess.some((a) => !a.revokedAt)) && (
                <ConfirmAction action={setOrderAccess} label="Revogar acesso" danger description="A cliente deixa de acessar os materiais deste pedido. Registrado na auditoria." hidden={{ id: order.id, mode: "revoke" }} />
              )}
              {isPaidStatus(order.status) && (
                <ConfirmAction action={markRefunded} label="Registrar reembolso" danger description='Marca o pedido como reembolsado e revoga o acesso. Digite REEMBOLSO para confirmar.' hidden={{ id: order.id }}>
                  <input name="confirm" placeholder="REEMBOLSO" className={inputCls} />
                </ConfirmAction>
              )}
            </div>
          </Card>

          <Card title="Observações internas">
            <ActionForm action={saveOrderNotes}>
              <input type="hidden" name="id" value={order.id} />
              <textarea name="notes" defaultValue={order.notes ?? ""} rows={3} className={textareaCls} aria-label="Observações internas" />
              <SubmitButton>Salvar</SubmitButton>
            </ActionForm>
          </Card>

          <Card title="Origem">
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
              {[
                ["Canal", order.channel],
                ["Dispositivo", order.device],
                ["utm_source", order.utmSource],
                ["utm_medium", order.utmMedium],
                ["utm_campaign", order.utmCampaign],
                ["utm_content", order.utmContent],
                ["utm_term", order.utmTerm],
                ["1º toque", [order.firstTouchSource, order.firstTouchCampaign].filter(Boolean).join(" / ")],
                ["fbclid", order.fbclid ? "sim" : null],
                ["gclid", order.gclid ? "sim" : null],
                ["ttclid", order.ttclid ? "sim" : null],
                ["Landing", order.landingPage],
                ["Referrer", order.referrer],
                ["Testes A/B", order.experiments ? JSON.stringify(order.experiments) : null],
              ].map(([k, v]) => (
                <div key={k as string} className="contents">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="truncate" title={String(v ?? "")}>{v || "—"}</dd>
                </div>
              ))}
            </dl>
          </Card>

          {(order.parentOrder || order.upsellOrders.length > 0 || order.upsellEvents.length > 0) && (
            <Card title="Upsells">
              {order.parentOrder && <p className="text-sm">Pedido principal: <Link href={`/admin/pedidos/${order.parentOrder.id}`} className="underline">{order.parentOrder.orderNumber}</Link></p>}
              <ul className="space-y-1 text-sm">
                {order.upsellEvents.map((e) => (
                  <li key={e.id}>{formatDate(e.createdAt, true)} · {e.upsell.name}: <b>{e.action === "VIEW" ? "exibido" : e.action === "ACCEPT" ? "aceito" : "recusado"}</b></li>
                ))}
                {order.upsellOrders.map((u) => (
                  <li key={u.id}>Pedido complementar <Link href={`/admin/pedidos/${u.id}`} className="underline">{u.orderNumber}</Link> · {formatBRL(u.totalCents)} · {ORDER_STATUS_LABEL[u.status]}</li>
                ))}
              </ul>
            </Card>
          )}
          <p className="text-xs text-slate-500">Link do cliente: <span className="break-all font-mono">{siteUrl()}/pedido/{order.orderNumber}?t=…</span></p>
        </div>
      </div>
    </div>
  );
}
