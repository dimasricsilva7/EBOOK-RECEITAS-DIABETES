"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon, formatIcon } from "@/components/ui/Icon";
import { Price } from "@/components/ui/Price";
import { gaEvent, metaEvent, track } from "@/lib/client/tracking";
import { MATERIAL_FORMAT_LABEL, ORDER_STATUS_LABEL, isAwaitingStatus, isCrediarioPending, isPaidStatus } from "@/lib/domain";
import { formatBRL } from "@/utils/format";
import type { PublicOrder, PublicUpsell } from "@/types/order";

function useCountdown(iso: string | null) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!iso) return;
    const end = new Date(iso).getTime();
    const tick = () => setLeft(Math.max(0, end - Date.now()));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [iso]);
  return left;
}

const fileSize = (n: number | null) => (n ? (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(n / 1024))} KB`) : null);

function Items({ order }: { order: PublicOrder }) {
  return (
    <div className="space-y-2.5 text-sm">
      {order.items.map((i, idx) => (
        <div key={idx} className="flex justify-between gap-3">
          <span className="text-ink/80">{i.name}{i.kind === "ORDER_BUMP" && <span className="ml-1.5 text-xs text-muted">(adicional)</span>}</span>
          <span className="shrink-0 tabular-nums">{formatBRL(i.totalPriceCents)}</span>
        </div>
      ))}
      {order.discountCents > 0 && (
        <div className="flex justify-between text-success"><span>Desconto{order.couponCode ? ` (${order.couponCode})` : ""}</span><span>− {formatBRL(order.discountCents)}</span></div>
      )}
      <div className="flex justify-between border-t border-line pt-2.5 font-semibold"><span>Total</span><span className="tabular-nums">{formatBRL(order.totalCents)}</span></div>
      {order.crediario && (
        <div className="flex justify-between pt-1 text-muted"><span>{order.crediario.methodLabel}</span><span className="font-semibold text-ink">{order.crediario.installmentLabel}</span></div>
      )}
    </div>
  );
}

/**
 * Oferta pós-compra (upsell e, ao recusá-lo, o downsell vinculado).
 * Aceitar gera um NOVO pedido PIX (cobrança separada); recusar só esconde ou leva ao downsell.
 * O pedido original permanece confirmado em qualquer caso.
 */
function UpsellOffer({ order, token, upsell }: { order: PublicOrder; token: string; upsell: PublicUpsell }) {
  const router = useRouter();
  const [offer, setOffer] = useState<PublicUpsell>(upsell);
  const [busy, setBusy] = useState<"accept" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const viewed = useRef<string>("");
  const kind = offer.kind ?? "upsell";

  // Registra a visualização de cada oferta exibida (upsell e depois downsell)
  useEffect(() => {
    const key = `${kind}:${offer.id}`;
    if (viewed.current === key) return;
    viewed.current = key;
    fetch("/api/upsell", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pedido: order.orderNumber, t: token, kind, upsellId: offer.id, action: "view" }) }).catch(() => {});
  }, [order.orderNumber, token, offer.id, kind]);

  const act = async (action: "accept" | "reject") => {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch("/api/upsell", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pedido: order.orderNumber, t: token, kind, upsellId: offer.id, action }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Não foi possível continuar.");
      if (action === "accept") {
        router.push(`/pedido/${json.orderNumber}?t=${json.token}`);
        return;
      }
      // Recusou: se veio um downsell, troca a oferta exibida; senão, atualiza (próximo upsell ou nada)
      if (json.downsell) {
        setOffer(json.downsell as PublicUpsell);
        setBusy(null);
      } else {
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível continuar.");
      setBusy(null);
    }
  };

  const eyebrow = kind === "downsell" ? "Uma opção mais enxuta (opcional)" : "Para continuar (opcional)";
  return (
    <section className="animate-rise overflow-hidden rounded-card border border-line bg-surface shadow-soft" aria-labelledby="upsell-title">
      <div className="paper px-6 py-4">
        <p className="eyebrow">{eyebrow}</p>
        <p className="mt-1 font-display text-xl">{offer.headline}</p>
      </div>
      <div className="grid gap-5 p-6 sm:grid-cols-[120px_1fr]">
        {offer.imageUrl ? <img src={offer.imageUrl} alt={offer.productName} className="aspect-square w-full rounded-2xl object-cover" /> : <div className="grid aspect-square place-items-center rounded-2xl bg-sand text-secondary"><Icon name="book" className="h-10 w-10" strokeWidth={1.2} /></div>}
        <div>
          <h2 id="upsell-title" className="font-display text-2xl">{offer.title}</h2>
          {offer.description && <p className="mt-1.5 leading-relaxed text-muted">{offer.description}</p>}
          <Price priceCents={offer.priceCents} listPriceCents={offer.listPriceCents} className="mt-3" />
          <p className="mt-1 text-xs text-muted">Pagamento separado via PIX — só é cobrado se você gerar e pagar o novo PIX. Seu pedido atual não muda.</p>
        </div>
      </div>
      {error && <p className="mx-6 mb-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
      <div className="flex flex-col gap-2 px-6 pb-6 sm:flex-row-reverse">
        <button onClick={() => act("accept")} disabled={!!busy} data-cta={`${kind}_accept`} className="btn-primary flex-1">
          {busy === "accept" ? "Gerando PIX…" : "Sim, quero adicionar"}
        </button>
        <button onClick={() => act("reject")} disabled={!!busy} data-cta={`${kind}_reject`} className="btn-light flex-1">
          {busy === "reject" ? "…" : "Não, obrigada"}
        </button>
      </div>
    </section>
  );
}

export type CrediarioTexts = { successTitle: string; successMessage: string; infoMessage: string };

export function OrderClient({ initial, token, qrSvg, upsell, whatsappUrl, crediarioTexts }: { initial: PublicOrder; token: string; qrSvg: string | null; upsell: PublicUpsell | null; whatsappUrl: string | null; crediarioTexts: CrediarioTexts }) {
  const router = useRouter();
  const [order, setOrder] = useState(initial);
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const awaiting = isAwaitingStatus(order.status);
  const left = useCountdown(awaiting ? order.pixExpiresAt : null);
  const paid = isPaidStatus(order.status);

  useEffect(() => setOrder(initial), [initial]);

  // Polling enquanto aguarda pagamento (o status vem SEMPRE do servidor/gateway, nunca do navegador)
  useEffect(() => {
    if (!awaiting) return;
    let stop = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/orders/status?pedido=${encodeURIComponent(order.orderNumber)}&t=${encodeURIComponent(token)}`, { cache: "no-store" });
        if (res.ok && !stop) {
          const next = (await res.json()) as PublicOrder;
          if (next.status !== order.status || next.pixCopyPaste !== order.pixCopyPaste) router.refresh();
          setOrder(next);
        }
      } catch {
        /* rede instável: tenta de novo */
      }
    };
    const t = setInterval(() => document.visibilityState === "visible" && poll(), 5000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [awaiting, order.orderNumber, order.status, order.pixCopyPaste, token, router]);

  // Purchase no navegador somente com pagamento confirmado pelo servidor (mesmo event_id da CAPI → deduplicação).
  // Recarregar/abrir de novo esta página não gera compra nova (marca local + metaEventId vem só de pedido pago).
  useEffect(() => {
    if (!paid || !order.metaEventId) return;
    const key = `adf_purchase_${order.orderNumber}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, "1");
    } catch {
      /* ignore */
    }
    metaEvent("Purchase", { value: order.totalCents / 100, currency: "BRL", content_type: "product", num_items: order.items.length }, { eventId: order.metaEventId });
    gaEvent("purchase", { transaction_id: order.orderNumber, value: order.totalCents / 100, currency: "BRL", items: order.items.map((i) => ({ item_name: i.name, price: i.unitPriceCents / 100, quantity: 1 })) });
  }, [paid, order.metaEventId, order.orderNumber, order.totalCents, order.items]);

  const copy = async () => {
    if (!order.pixCopyPaste) return;
    try {
      await navigator.clipboard.writeText(order.pixCopyPaste);
    } catch {
      const ta = document.getElementById("pix-code") as HTMLTextAreaElement | null;
      ta?.select();
      document.execCommand("copy");
    }
    setCopied(true);
    track("pix_copy", { valueCents: order.totalCents });
    setTimeout(() => setCopied(false), 2500);
  };

  const checkNow = async () => {
    setChecking(true);
    try {
      const res = await fetch(`/api/orders/status?pedido=${encodeURIComponent(order.orderNumber)}&t=${encodeURIComponent(token)}&force=1`, { cache: "no-store" });
      if (res.ok) {
        const next = (await res.json()) as PublicOrder;
        setOrder(next);
        if (next.status !== order.status) router.refresh();
      }
    } finally {
      setTimeout(() => setChecking(false), 1200);
    }
  };

  const retryPix = async () => {
    setRetrying(true);
    try {
      await fetch(`/api/orders/status?pedido=${encodeURIComponent(order.orderNumber)}&t=${encodeURIComponent(token)}&retry=1`, { cache: "no-store" });
      router.refresh();
    } finally {
      setTimeout(() => setRetrying(false), 1500);
    }
  };

  const [renewing, setRenewing] = useState(false);
  const [renewError, setRenewError] = useState<string | null>(null);
  const renewPix = async () => {
    setRenewing(true);
    setRenewError(null);
    try {
      const res = await fetch("/api/orders/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pedido: order.orderNumber, t: token }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Não foi possível gerar um novo PIX.");
      setOrder(json as PublicOrder);
      track("pix_renewed", { valueCents: order.totalCents });
      router.refresh();
    } catch (e) {
      setRenewError(e instanceof Error ? e.message : "Não foi possível gerar um novo PIX.");
    } finally {
      setRenewing(false);
    }
  };
  const credPending = isCrediarioPending(order.status);
  const credRejected = order.status === "CREDIARIO_RECUSADO";
  const canRenew = order.status === "EXPIRED" || order.status === "FAILED";
  const expiredNow = awaiting && left === 0;
  const mm = left != null ? Math.floor(left / 60000) : null;
  const ss = left != null ? Math.floor((left % 60000) / 1000) : null;
  const statusLabel = ORDER_STATUS_LABEL[order.status as keyof typeof ORDER_STATUS_LABEL] ?? order.status;

  return (
    <div className="container-page max-w-2xl space-y-6 py-8 sm:py-12">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Pedido {order.orderNumber}</p>
        {awaiting && <h1 className="mt-3 font-display text-[2rem] leading-tight sm:text-5xl">Falta pouco, {order.customerFirstName}</h1>}
        {paid && <h1 className="mt-3 font-display text-[2rem] leading-tight sm:text-5xl">Seu acesso está liberado</h1>}
        {credPending && <h1 className="mt-3 font-display text-[2rem] leading-tight sm:text-5xl">{crediarioTexts.successTitle}</h1>}
        {canRenew && <h1 className="mt-3 font-display text-[2rem] leading-tight sm:text-5xl">Seu pedido continua salvo</h1>}
        {!awaiting && !paid && !canRenew && !credPending && <h1 className="mt-3 font-display text-3xl">{statusLabel}</h1>}
        {paid && <p className="lead mt-3">Obrigada, {order.customerFirstName}. Enviamos também um e-mail com este link — guarde-o para voltar quando quiser.</p>}
      </div>

      {/* Crediário: pedido registrado, aguardando análise */}
      {credPending && (
        <section className="card p-6 text-center" aria-labelledby="cred-title">
          <Icon name="clock" className="mx-auto h-10 w-10 text-secondary" />
          <p id="cred-title" className="mt-3 font-semibold">{order.crediario?.methodLabel ?? "Crediário"}{order.crediario?.installmentLabel ? ` · ${order.crediario.installmentLabel}` : ""}</p>
          {crediarioTexts.successMessage && <p className="mt-2 text-muted">{crediarioTexts.successMessage}</p>}
          {crediarioTexts.infoMessage && <p className="mt-3 rounded-xl bg-sand px-4 py-3 text-sm">{crediarioTexts.infoMessage}</p>}
          <p className="mt-3 text-sm font-semibold text-primary">{statusLabel}</p>
        </section>
      )}

      {credRejected && (
        <section className="card p-6 text-center">
          <p className="font-semibold">{ORDER_STATUS_LABEL.CREDIARIO_RECUSADO}</p>
          <p className="mt-2 text-muted">Não foi possível aprovar este pedido no crediário. Fale com o suporte para concluir a compra de outra forma.</p>
          <Link href="/suporte" className="btn-light mt-4">Falar com o suporte</Link>
        </section>
      )}

      {/* PIX vencido → novo código no mesmo pedido */}
      {(canRenew || expiredNow) && (
        <section className="card overflow-hidden text-center" aria-labelledby="renew-title">
          <div className="paper px-6 py-5">
            <p id="renew-title" className="font-semibold">O código PIX anterior expirou</p>
            <p className="mt-1 font-display text-4xl tabular-nums">{formatBRL(order.totalCents)}</p>
            <p className="mt-1 text-sm text-muted">Gere um novo código em 1 toque — mesmo pedido, mesmo valor.</p>
          </div>
          <div className="p-6">
            <button onClick={renewPix} disabled={renewing} data-cta="pix_renew" className="btn-primary w-full">{renewing ? "Gerando novo PIX…" : "Gerar novo PIX"}</button>
            {renewError && <p className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{renewError}</p>}
            <p className="mt-3 text-xs text-muted">Se você já pagou o código anterior, não pague de novo: fale com o suporte.</p>
          </div>
        </section>
      )}

      {/* PIX */}
      {awaiting && order.pixCopyPaste && !expiredNow && (
        <section className="card overflow-hidden" aria-labelledby="pix-title">
          <div className="paper px-6 py-5 text-center">
            <p id="pix-title" className="text-sm font-semibold uppercase tracking-[0.14em] text-secondary">Pague com PIX</p>
            <p className="mt-1 font-display text-5xl tabular-nums">{formatBRL(order.totalCents)}</p>
            {left != null && (
              <p className={`mt-2 text-sm font-medium ${left < 5 * 60000 ? "text-danger" : "text-muted"}`} aria-live="polite">
                {left > 0 ? `Código válido por ${mm}:${String(ss).padStart(2, "0")}` : "O prazo deste PIX terminou. Se já pagou, aguarde a confirmação."}
              </p>
            )}
          </div>
          <div className="p-6">
            <button onClick={copy} data-cta="pix_copy" className={`btn w-full ${copied ? "bg-success text-white" : "btn-primary"}`}>
              <Icon name={copied ? "check" : "pix"} className="h-5 w-5" /> {copied ? "Código copiado — agora pague no app do banco" : "Copiar código PIX"}
            </button>
            <label htmlFor="pix-code" className="sr-only">Código PIX copia e cola</label>
            <textarea id="pix-code" readOnly value={order.pixCopyPaste} rows={3} className="mt-3 w-full resize-none rounded-2xl border border-line bg-bg p-3 font-mono text-xs text-muted" onFocus={(e) => e.currentTarget.select()} />
            <ol className="mt-4 space-y-2 text-sm text-ink/80">
              {["Copie o código acima ou escaneie o QR Code", "No app do banco, escolha PIX copia e cola", "Confirme — a liberação aqui é automática"].map((t, i) => (
                <li key={t} className="flex items-center gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-sand font-display text-sm text-primary">{i + 1}</span>{t}</li>
              ))}
            </ol>
            {qrSvg && (
              <div className="mt-5 text-center">
                <p className="text-sm font-semibold text-secondary">Ou escaneie o QR Code no app do banco</p>
                <div className="mx-auto mt-3 w-52 rounded-2xl border border-line bg-white p-3 [&_svg]:h-auto [&_svg]:w-full" role="img" aria-label="QR Code do PIX" dangerouslySetInnerHTML={{ __html: qrSvg }} />
              </div>
            )}
            <div className="mt-5 flex items-center justify-center gap-2 text-sm text-muted" aria-live="polite">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success" />
              </span>
              Aguardando pagamento — esta página atualiza sozinha
            </div>
            <button onClick={checkNow} disabled={checking} className="btn-ghost mt-1 w-full">{checking ? "Verificando…" : "Já paguei — verificar agora"}</button>
          </div>
        </section>
      )}

      {awaiting && !order.pixCopyPaste && (
        <section className="card p-6 text-center">
          <p className="font-semibold">{order.pixError ? "Não conseguimos gerar o PIX agora." : "Gerando seu PIX…"}</p>
          <button onClick={retryPix} disabled={retrying} className="btn-primary mt-4">{retrying ? "Tentando…" : "Tentar novamente"}</button>
        </section>
      )}

      {/* Área de acesso: materiais liberados após a confirmação */}
      {paid && (
        <section className="card overflow-hidden" aria-labelledby="access-title">
          <div className="border-b border-line px-6 py-5">
            <h2 id="access-title" className="font-display text-2xl">Seus materiais</h2>
            <p className="mt-1 text-sm text-muted">Acesse quando quiser, no seu ritmo.</p>
          </div>
          {order.digital.length === 0 && <p className="p-6 text-sm text-muted">Estamos liberando o seu acesso. Atualize a página em instantes ou fale com o suporte.</p>}
          {order.digital.map((d) => (
            <div key={d.token} className="border-b border-line p-6 last:border-0">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-secondary">{d.name}</p>
              {d.note && <p className="mt-2 text-sm leading-relaxed text-ink/80">{d.note}</p>}
              <ul className="mt-4 space-y-3">
                {d.materials.map((m) => (
                  <li key={m.id} className="flex flex-col gap-3 rounded-2xl bg-bg p-4 sm:flex-row sm:items-center">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-sand text-secondary"><Icon name={formatIcon(m.format)} className="h-5 w-5" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold leading-snug">{m.title}</p>
                      <p className="text-xs text-muted">
                        {MATERIAL_FORMAT_LABEL[m.format as keyof typeof MATERIAL_FORMAT_LABEL] ?? m.format}
                        {fileSize(m.fileSize) ? ` · ${fileSize(m.fileSize)}` : ""}
                      </p>
                      {m.howToUse && <p className="mt-1 text-sm text-muted">{m.howToUse}</p>}
                    </div>
                    <a href={m.href} target="_blank" rel="noopener noreferrer" data-cta="material_open" className="btn-dark min-h-[44px] shrink-0 px-5 text-sm">
                      <Icon name={m.source === "link" ? "link" : "download"} className="h-4 w-4" /> {m.source === "link" ? "Abrir" : "Baixar"}
                    </a>
                  </li>
                ))}
              </ul>
              {!d.available && d.materials.length === 0 && <p className="mt-3 text-sm text-muted">Este acesso não está disponível. Fale com o suporte.</p>}
              {d.pendingCount > 0 && <p className="mt-3 text-xs text-muted">{d.pendingCount} material(is) deste produto ainda em preparação — avisaremos por e-mail quando forem liberados.</p>}
              {d.maxDownloads != null && <p className="mt-2 text-xs text-muted">{d.downloads}/{d.maxDownloads} acessos usados</p>}
              {d.expiresAt && <p className="mt-1 text-xs text-muted">Acesso válido até {new Date(d.expiresAt).toLocaleDateString("pt-BR")}</p>}
            </div>
          ))}
        </section>
      )}

      {paid && order.children.filter((c) => isPaidStatus(c.status)).length > 0 && (
        <section className="card p-6">
          <h2 className="font-display text-xl">Compras complementares</h2>
          <ul className="mt-3 space-y-2">
            {order.children.filter((c) => isPaidStatus(c.status)).map((c) => (
              <li key={c.orderNumber}>
                <Link href={`/pedido/${c.orderNumber}?t=${c.token}`} className="flex items-center justify-between rounded-xl bg-bg px-4 py-3 text-sm font-semibold hover:bg-sand">
                  {c.name} <Icon name="arrow" className="h-4 w-4" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {paid && upsell && <UpsellOffer order={order} token={token} upsell={upsell} />}

      {order.parent && (
        <Link href={`/pedido/${order.parent.orderNumber}?t=${order.parent.token}`} className="btn-light w-full">
          Voltar ao pedido principal
        </Link>
      )}

      <section className="card p-6">
        <h2 className="font-display text-xl">Resumo do pedido</h2>
        <div className="mt-4"><Items order={order} /></div>
      </section>

      <div className="flex flex-col items-center gap-2 text-sm">
        <Link href="/suporte" className="btn-light w-full sm:w-auto">Precisa de ajuda? Fale com o suporte</Link>
        {whatsappUrl && <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost">WhatsApp</a>}
      </div>
    </div>
  );
}
