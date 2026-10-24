"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { Icon } from "@/components/ui/Icon";
import { gaEvent, getClientContext, metaEvent, newEventId, randomId, track, trackOnce } from "@/lib/client/tracking";
import { formatBRL } from "@/utils/format";
import { maskCpf, maskPhone, onlyDigits } from "@/utils/validators";
import type { CartQuote, QuoteBump } from "@/types/catalog";
import { OfferModal } from "./OfferModal";
import { CrediarioFields, EMPTY_CREDIARIO, type CrediarioValue } from "@/components/checkout/CrediarioFields";
import { parseValidity, validateCrediario, type CrediarioConfig } from "@/lib/crediario";
import { ReservationBar } from "@/components/checkout/ReservationBar";
import { TrustSeals } from "@/components/checkout/TrustSeals";
import { readQuizLocal } from "@/components/landing/client";

export type PixOption = { enabled: boolean; label: string; badge: string; description: string; button: string };

type Form = { name: string; email: string; phone: string; cpf: string };
const EMPTY: Form = { name: "", email: "", phone: "", cpf: "" };
const FORM_KEY = "adf_checkout_form";
const TOKEN_KEY = "adf_checkout_token";
const LEAD_KEY = "adf_lead_key";

/** Chave do lead deste checkout (persiste entre abas; renovada após gerar o pedido). */
function leadKey(): string {
  try {
    const saved = localStorage.getItem(LEAD_KEY);
    if (saved && /^[A-Za-z0-9_-]{16,64}$/.test(saved)) return saved;
    const k = randomId(32);
    localStorage.setItem(LEAD_KEY, k);
    return k;
  } catch {
    return randomId(32);
  }
}

const quizId = () => {
  const id = readQuizLocal().id;
  return id && /^[A-Za-z0-9_-]{16,64}$/.test(id) ? id : null;
};

function Field({ id, label, error, children, hint }: { id: string; label: string; error?: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      {children}
      {error ? <p id={`${id}-error`} className="mt-1 text-sm font-semibold text-danger">{error}</p> : hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

function Summary({ q }: { q: CartQuote }) {
  return (
    <div className="space-y-2.5 text-sm">
      {q.lines.map((l) => (
        <div key={`${l.kind}-${l.productId}`} className="flex justify-between gap-3">
          <span className="text-ink/80">
            {l.name}
            {l.kind === "ORDER_BUMP" && <span className="ml-1.5 rounded bg-accent/25 px-1.5 text-[11px] font-semibold text-ink">adicional</span>}
          </span>
          <span className="shrink-0 tabular-nums">{formatBRL(l.totalCents)}</span>
        </div>
      ))}
      {q.discountCents > 0 && (
        <div className="flex justify-between text-success">
          <span>Desconto{q.coupon?.code ? ` (${q.coupon.code})` : ""}</span>
          <span className="tabular-nums">− {formatBRL(q.discountCents)}</span>
        </div>
      )}
      <div className="flex items-baseline justify-between border-t border-line pt-3">
        <span className="font-semibold">Total</span>
        <span className="font-display text-3xl tabular-nums">{formatBRL(q.totalCents)}</span>
      </div>
    </div>
  );
}

export function CheckoutClient({
  title,
  requireCpf,
  checkoutNote,
  accessText,
  securityText,
  bumpTitle,
  bumpText,
  consentLabel,
  pix,
  crediario,
  cnpj,
  companyName,
  reservationMinutes,
  salesClosed,
}: {
  title: string;
  requireCpf: boolean;
  checkoutNote: string | null;
  accessText: string;
  securityText: string;
  bumpTitle: string;
  bumpText: string;
  consentLabel: string;
  pix: PixOption;
  crediario: CrediarioConfig;
  cnpj: string | null;
  companyName: string | null;
  reservationMinutes: number;
  salesClosed: string | null;
}) {
  const cart = useCart();
  const router = useRouter();
  const q = cart.quote;
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [couponOpen, setCouponOpen] = useState(false);
  const started = useRef(false);
  const modalShown = useRef(false);
  const [modalBump, setModalBump] = useState<QuoteBump | null>(null);
  const availableMethods = [pix.enabled && "PIX", crediario.enabled && "CREDIARIO"].filter(Boolean) as ("PIX" | "CREDIARIO")[];
  const [method, setMethod] = useState<"PIX" | "CREDIARIO">(availableMethods[0] ?? "PIX");
  const [cred, setCred] = useState<CrediarioValue>(EMPTY_CREDIARIO);
  const credStarted = useRef(false);
  // Anti-robô: campo isca invisível (pessoas não preenchem) e momento em que o formulário abriu
  const honeypot = useRef<HTMLInputElement>(null);
  const openedAt = useRef(Date.now());

  useEffect(() => {
    let quizEmail = "";
    try {
      quizEmail = localStorage.getItem("dm_quiz_email") || "";
    } catch {
      /* ignore */
    }
    try {
      const saved = JSON.parse(sessionStorage.getItem(FORM_KEY) ?? "null");
      if (saved) setForm({ ...EMPTY, ...saved, email: saved.email || quizEmail });
      else if (quizEmail) setForm((f) => ({ ...f, email: quizEmail }));
    } catch {
      if (quizEmail) setForm((f) => ({ ...f, email: quizEmail }));
    }
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem(FORM_KEY, JSON.stringify(form));
    } catch {
      /* ignore */
    }
  }, [form]);

  // Link do e-mail de checkout abandonado (?recuperar=token): restaura pedido e contato
  const [restoring, setRestoring] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("recuperar"));
  useEffect(() => {
    if (!cart.ready || !restoring) return;
    const token = new URLSearchParams(window.location.search).get("recuperar");
    fetch(`/api/checkout/lead?token=${encodeURIComponent(token ?? "")}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((lead: { clientKey: string; name: string | null; email: string | null; phone: string | null; items: { productId: string; quantity: number }[]; bumpIds: string[]; couponCode: string | null } | null) => {
        if (!lead) return;
        if (lead.items?.length) cart.restore({ items: lead.items, bumpIds: lead.bumpIds, couponCode: lead.couponCode });
        setForm((f) => ({ ...f, name: f.name || lead.name || "", email: f.email || lead.email || "", phone: f.phone || (lead.phone ? maskPhone(lead.phone) : "") }));
        try {
          localStorage.setItem(LEAD_KEY, lead.clientKey);
        } catch {
          /* ignore */
        }
        track("checkout_recovered", { props: { via: "email" } });
      })
      .catch(() => null)
      .finally(() => {
        setRestoring(false);
        window.history.replaceState(null, "", "/checkout");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.ready, restoring]);

  // Guarda o contato digitado para o admin ver checkouts não finalizados (lembrete por e-mail só se ativado)
  const lastLead = useRef("");
  useEffect(() => {
    if (!cart.ready || restoring || !cart.items.length) return;
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim());
    if (!emailOk && onlyDigits(form.phone).length < 10) return;
    const t = setTimeout(() => {
      const payload = { clientKey: leadKey(), name: form.name.trim() || null, email: emailOk ? form.email.trim() : null, phone: onlyDigits(form.phone) || null, items: cart.items, bumpIds: cart.bumpIds, couponCode: cart.couponCode, quizSessionId: quizId(), context: getClientContext() };
      const sig = JSON.stringify([payload.clientKey, payload.name, payload.email, payload.phone, payload.items, payload.bumpIds, payload.couponCode]);
      if (sig === lastLead.current) return;
      lastLead.current = sig;
      fetch("/api/checkout/lead", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), keepalive: true }).catch(() => {
        lastLead.current = "";
      });
    }, 1200);
    return () => clearTimeout(t);
  }, [cart.ready, restoring, cart.items, cart.bumpIds, cart.couponCode, form.name, form.email, form.phone]);

  // checkout_started + InitiateCheckout (uma vez, quando o orçamento chega)
  useEffect(() => {
    if (!q || started.current || !q.lines.length) return;
    started.current = true;
    const main = q.lines.find((l) => l.kind !== "ORDER_BUMP");
    metaEvent(
      "InitiateCheckout",
      { value: q.totalCents / 100, currency: "BRL", num_items: q.lines.length, content_ids: q.lines.map((l) => l.slug), content_type: "product" },
      { mirror: true, internal: { name: "checkout_started", productId: main?.productId ?? null, valueCents: q.totalCents } }
    );
    gaEvent("begin_checkout", { currency: "BRL", value: q.totalCents / 100, items: q.lines.map((l) => ({ item_id: l.slug, item_name: l.name, price: l.unitPriceCents / 100, quantity: 1 })) });
  }, [q]);

  useEffect(() => {
    q?.bumps.forEach((b) => trackOnce(`bump:${b.id}`, "order_bump_view", { productId: b.productId, element: `bump_${b.id}`, valueCents: b.priceCents, props: { bumpId: b.id } }));
  }, [q]);

  useEffect(() => {
    if (q?.coupon && !q.coupon.valid) setErrors((e) => ({ ...e, couponCode: q.coupon?.message ?? "Cupom inválido" }));
    if (q?.coupon?.valid) {
      setErrors(({ couponCode: _c, ...rest }) => rest);
      track("coupon_applied", { valueCents: q.discountCents, props: { code: q.coupon.code } });
    }
  }, [q?.coupon, q?.discountCents]);

  const set = (k: keyof Form, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k] || errors[`customer.${k}`]) setErrors(({ [k]: _a, [`customer.${k}`]: _b, ...rest }) => rest);
  };

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (form.name.trim().split(/\s+/).length < 2) e.name = "Informe nome e sobrenome";
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) e.email = "E-mail inválido";
    if (onlyDigits(form.phone).length < 10) e.phone = "WhatsApp inválido";
    if (requireCpf && onlyDigits(form.cpf).length !== 11) e.cpf = "Informe seu CPF";
    if (method === "CREDIARIO") for (const [k, v] of Object.entries(validateCrediario(cred, crediario))) e[`crediario.${k}`] = v;
    return e;
  }

  async function submit(ev: React.FormEvent | null, opts: { extraBumpIds?: string[]; skipModal?: boolean } = {}) {
    ev?.preventDefault();
    if (!q || submitting) return;
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      setFormError("Confira os campos destacados.");
      const first = Object.keys(e)[0];
      const id = first.startsWith("crediario.") ? ({ protocol: "cred-protocol", validity: "cred-validity", cpfLast3: "cred-cpf", installments: "cred-protocol" }[first.slice(10)] ?? "h-pagamento") : first;
      document.getElementById(id)?.focus();
      document.getElementById(id)?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    // Oferta em destaque: abre o modal uma única vez, antes de gerar o PIX (sempre opcional)
    const offer = q.bumps.find((b) => b.showModal && !cart.bumpIds.includes(b.id));
    if (offer && !opts.skipModal && !modalShown.current) {
      modalShown.current = true;
      setModalBump(offer);
      track("order_bump_view", { productId: offer.productId, element: "bump_modal", valueCents: offer.priceCents, props: { bumpId: offer.id } });
      return;
    }
    const bumpIds = [...new Set([...cart.bumpIds, ...(opts.extraBumpIds ?? [])])];
    setFormError(null);
    setSubmitting(true);
    // Idempotência ligada ao conteúdo do pedido: repetir o envio reaproveita o mesmo pedido
    const sig = JSON.stringify([cart.items, bumpIds, cart.couponCode, form.email, method, method === "CREDIARIO" ? cred.installments : 0]);
    let token = "";
    try {
      const saved = JSON.parse(sessionStorage.getItem(TOKEN_KEY) ?? "null") as { token: string; sig: string } | null;
      if (saved?.sig === sig) token = saved.token;
    } catch {
      /* ignore */
    }
    if (!token) {
      token = randomId(32);
      try {
        sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ token, sig }));
      } catch {
        /* ignore */
      }
    }
    const paymentEventId = newEventId("addpaymentinfo");
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkoutToken: token,
          customer: { name: form.name, email: form.email, phone: form.phone, cpf: form.cpf || null },
          items: cart.items,
          bumpIds,
          couponCode: cart.couponCode,
          marketingConsent: consent,
          paymentMethod: method,
          crediario: method === "CREDIARIO" ? cred : null,
          paymentEventId,
          leadKey: leadKey(),
          quizSessionId: quizId(),
          hp: honeypot.current?.value || undefined,
          elapsedMs: Date.now() - openedAt.current,
          context: getClientContext(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (json.fields) {
          const mapped: Record<string, string> = {};
          for (const [k, v] of Object.entries(json.fields as Record<string, string>)) mapped[k.replace(/^customer\./, "")] = v;
          setErrors(mapped);
        }
        if (res.status === 409) cart.refresh();
        throw new Error(json.error ?? (method === "CREDIARIO" ? crediario.errorMessage : "Não conseguimos gerar o PIX agora. Tente novamente."));
      }
      metaEvent("AddPaymentInfo", { value: json.totalCents / 100, currency: "BRL", payment_type: method === "PIX" ? "pix" : "crediario" }, { eventId: paymentEventId });
      gaEvent("add_payment_info", { currency: "BRL", value: json.totalCents / 100, payment_type: method === "PIX" ? "pix" : "crediario" });
      try {
        sessionStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(FORM_KEY);
        localStorage.removeItem(LEAD_KEY);
      } catch {
        /* ignore */
      }
      cart.clear();
      router.push(`/pedido/${json.orderNumber}?t=${json.token}`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Não conseguimos gerar o PIX agora. Tente novamente.");
      setSubmitting(false);
    }
  }

  if (salesClosed) {
    return (
      <div className="container-page max-w-lg py-24 text-center">
        <h1 className="h-section">Vendas fechadas no momento</h1>
        <p className="lead mt-4">{salesClosed}</p>
        <Link href="/" className="btn-primary mt-8">Voltar ao início</Link>
      </div>
    );
  }
  if (cart.ready && !cart.items.length && !restoring) {
    return (
      <div className="container-page max-w-lg py-24 text-center">
        <h1 className="h-section">Seu pedido está vazio</h1>
        <p className="lead mt-4">Conheça o Diabetes à Mesa e volte quando quiser.</p>
        <Link href="/e-book#oferta" className="btn-primary mt-8">Conhecer o e-book</Link>
      </div>
    );
  }
  if (!q) {
    return (
      <div className="container-page max-w-2xl space-y-4 py-10" aria-busy="true" aria-label="Carregando checkout">
        {cart.error ? (
          <div className="rounded-2xl bg-danger/10 p-4 text-center">
            <p className="font-semibold text-danger">{cart.error}</p>
            <button onClick={cart.refresh} className="btn-light mt-3">Tentar novamente</button>
          </div>
        ) : (
          [0, 1, 2].map((i) => <div key={i} className="h-40 animate-pulse rounded-card bg-ink/5" />)
        )}
      </div>
    );
  }

  const productLines = q.lines.filter((l) => l.kind !== "ORDER_BUMP");
  const inv = (k: string) => (errors[k] ? { "aria-invalid": true as const, "aria-describedby": `${k}-error` } : {});
  const submitLabel = submitting ? (method === "CREDIARIO" ? "Registrando pedido…" : "Gerando PIX…") : method === "CREDIARIO" ? crediario.buttonLabel : pix.button;
  const legal = (
    <p className="mt-3 text-center text-xs text-muted">
      Ao continuar, você concorda com os <Link href="/termos" className="underline">Termos</Link> e a <Link href="/politica-de-privacidade" className="underline">Política de Privacidade</Link>.
    </p>
  );

  return (
    <>
      {modalBump && (
        <OfferModal
          bump={modalBump}
          busy={submitting}
          onAccept={() => {
            cart.toggleBump(modalBump.id, true);
            track("order_bump_accept", { productId: modalBump.productId, element: "bump_modal", valueCents: modalBump.priceCents, props: { bumpId: modalBump.id } });
            const id = modalBump.id;
            setModalBump(null);
            submit(null, { extraBumpIds: [id], skipModal: true });
          }}
          onDecline={() => {
            track("order_bump_reject", { productId: modalBump.productId, element: "bump_modal", valueCents: modalBump.priceCents, props: { bumpId: modalBump.id } });
            setModalBump(null);
            submit(null, { skipModal: true });
          }}
        />
      )}
      {reservationMinutes > 0 && (
        <div className="container-page pt-4 sm:pt-6">
          <ReservationBar minutes={reservationMinutes} />
        </div>
      )}
      <form onSubmit={submit} noValidate className="container-page grid gap-6 pb-16 pt-6 sm:pt-10 lg:grid-cols-[1fr_400px] lg:items-start lg:gap-12">
        {/* campo isca: fora da tela, sem foco nem preenchimento automático — só robôs preenchem */}
        <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", top: "auto", width: 1, height: 1, overflow: "hidden" }}>
          <label htmlFor="adf-website">Site</label>
          <input ref={honeypot} id="adf-website" name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
        </div>
        <div className="space-y-6">
          <div>
            <h1 className="font-display text-[2.1rem] leading-tight sm:text-5xl">{title}</h1>
            <p className="mt-2 flex items-center gap-2 text-sm text-muted">
              <Icon name="mail" className="h-4 w-4 text-secondary" /> {accessText}
            </p>
          </div>

          {/* Produto */}
          <section className="card overflow-hidden" aria-labelledby="h-itens">
            <h2 id="h-itens" className="sr-only">Seu pedido</h2>
            {q.removed.length > 0 && <p className="m-4 rounded-xl bg-warning/10 px-3 py-2 text-sm">Removemos itens indisponíveis: {q.removed.join(", ")}.</p>}
            <ul className="divide-y divide-line">
              {productLines.map((l) => (
                <li key={l.productId} className="flex items-center gap-4 p-4 sm:p-5">
                  {l.imageUrl ? <img src={l.imageUrl} alt="" className="h-20 w-16 shrink-0 rounded-xl object-cover" /> : <span className="grid h-20 w-16 shrink-0 place-items-center rounded-xl bg-sand text-secondary"><Icon name="book" className="h-7 w-7" /></span>}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-secondary">Produto digital</p>
                    <p className="mt-1 font-display text-xl leading-tight">{l.name}</p>
                    {l.listPriceCents && <s className="text-sm text-muted">{formatBRL(l.listPriceCents)}</s>}
                  </div>
                  <p className="shrink-0 font-display text-xl tabular-nums">{formatBRL(l.totalCents)}</p>
                </li>
              ))}
            </ul>
          </section>

          {/* Dados */}
          <section className="card space-y-4 p-5 sm:p-6" aria-labelledby="h-dados">
            <h2 id="h-dados" className="font-display text-2xl">Seus dados</h2>
            <Field id="name" label="Nome completo" error={errors.name}>
              <input id="name" value={form.name} onChange={(e) => set("name", e.target.value)} autoComplete="name" className="input" {...inv("name")} />
            </Field>
            <Field id="email" label="E-mail (onde você recebe o acesso)" error={errors.email} hint="Confira com atenção: o acesso aos materiais chega neste e-mail.">
              <input id="email" type="email" value={form.email} onChange={(e) => set("email", e.target.value.trim())} autoComplete="email" inputMode="email" className="input" {...inv("email")} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="phone" label="WhatsApp" error={errors.phone}>
                <input id="phone" value={form.phone} onChange={(e) => set("phone", maskPhone(e.target.value))} autoComplete="tel-national" inputMode="tel" placeholder="(11) 91234-5678" className="input" {...inv("phone")} />
              </Field>
              {requireCpf && (
                <Field id="cpf" label="CPF (exigido para o PIX)" error={errors.cpf}>
                  <input id="cpf" value={form.cpf} onChange={(e) => set("cpf", maskCpf(e.target.value))} inputMode="numeric" placeholder="000.000.000-00" className="input" {...inv("cpf")} />
                </Field>
              )}
            </div>
          </section>

          {/* Order bumps — opcionais e desmarcados por padrão, com destaque visual */}
          {q.bumps.length > 0 && (
            <section className="overflow-hidden rounded-card border-2 border-accent/60 shadow-soft" aria-labelledby="h-extras">
              <div className="bg-accent px-4 py-2.5 sm:px-5">
                <span className="text-sm font-extrabold uppercase tracking-wide text-ink">⭐ Ofertas especiais só nesta página</span>
              </div>
              <div className="space-y-3 bg-accent/[0.07] p-4 sm:p-5">
                <div>
                  <h2 id="h-extras" className="font-display text-xl">{bumpTitle}</h2>
                  {bumpText && <p className="text-sm text-muted">{bumpText}</p>}
                </div>
                {q.bumps.map((b) => {
                  const selected = cart.bumpIds.includes(b.id);
                  return (
                    <label key={b.id} className={`relative flex cursor-pointer gap-4 rounded-2xl border-2 bg-surface p-4 transition ${selected ? "border-success bg-success/[0.07] shadow-soft" : "border-accent/60 hover:border-accent hover:shadow-lift"}`}>
                      {!selected && <span className="absolute -top-2.5 left-4 rounded-full bg-accent px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-ink shadow-sm">Adicione ao pedido</span>}
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(e) => {
                          cart.toggleBump(b.id, e.target.checked);
                          track(e.target.checked ? "order_bump_accept" : "order_bump_reject", { productId: b.productId, element: `bump_${b.id}`, valueCents: b.priceCents, props: { bumpId: b.id } });
                        }}
                        className="mt-1 h-5 w-5 shrink-0 accent-[rgb(var(--c-secondary))]"
                        data-cta={`order_bump_${b.id}`}
                      />
                      {b.imageUrl && <img src={b.imageUrl} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />}
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                          <span className="font-bold leading-snug">{b.title}</span>
                          <span className="shrink-0 text-lg font-extrabold tabular-nums text-primary">
                            + {formatBRL(b.priceCents)}
                            {b.listPriceCents && <s className="ml-1.5 text-xs font-normal text-muted">{formatBRL(b.listPriceCents)}</s>}
                          </span>
                        </span>
                        {b.description && <span className="mt-1 block text-sm leading-relaxed text-muted">{b.description}</span>}
                        {b.benefit && <span className="mt-1 block text-sm font-medium text-secondary">{b.benefit}</span>}
                        {selected ? (
                          <span className="mt-2 block text-sm font-bold text-success">✓ Adicionado ao pedido</span>
                        ) : (
                          <span className="mt-2 inline-flex items-center gap-1 text-sm font-bold text-primary">+ Marcar para adicionar</span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            </section>
          )}

          {/* Cupom */}
          <section className="px-1">
            {!couponOpen && !cart.couponCode ? (
              <button type="button" onClick={() => setCouponOpen(true)} className="text-sm font-semibold text-primary underline-offset-4 hover:underline">
                Tenho um cupom de desconto
              </button>
            ) : (
              <div className="card p-4">
                <label htmlFor="couponCode" className="label">Cupom</label>
                <div className="flex gap-2">
                  <input id="couponCode" value={couponInput || cart.couponCode || ""} onChange={(e) => setCouponInput(e.target.value.toUpperCase())} className="input uppercase" autoComplete="off" {...inv("couponCode")} />
                  {cart.couponCode ? (
                    <button type="button" onClick={() => { cart.setCoupon(null); setCouponInput(""); setErrors(({ couponCode: _c, ...r }) => r); }} className="btn-light shrink-0 px-5">Remover</button>
                  ) : (
                    <button type="button" onClick={() => couponInput && cart.setCoupon(couponInput)} className="btn-dark shrink-0 px-5">Aplicar</button>
                  )}
                </div>
                {errors.couponCode && <p id="couponCode-error" className="mt-1 text-sm font-semibold text-danger">{errors.couponCode}</p>}
                {q.coupon?.valid && <p className="mt-1 text-sm font-semibold text-success">Cupom aplicado: − {formatBRL(q.discountCents)}</p>}
              </div>
            )}
          </section>

          {/* Forma de pagamento */}
          <section className="card p-5 sm:p-6" aria-labelledby="h-pagamento">
            <h2 id="h-pagamento" className="font-display text-2xl">Pagamento</h2>
            {availableMethods.length === 0 && <p className="mt-3 rounded-xl bg-warning/10 px-4 py-3 text-sm">Os pagamentos estão temporariamente indisponíveis. Tente novamente em alguns minutos.</p>}
            <div className="mt-4 grid gap-3" role="radiogroup" aria-label="Forma de pagamento">
              {pix.enabled && (
                <button type="button" role="radio" aria-checked={method === "PIX"} onClick={() => setMethod("PIX")} data-cta="method_pix" className={`flex items-center gap-4 rounded-2xl border p-4 text-left transition ${method === "PIX" ? "border-primary bg-primary/[0.05]" : "border-line hover:border-ink/25"}`}>
                  <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${method === "PIX" ? "border-primary" : "border-line"}`}>{method === "PIX" && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}</span>
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-secondary/10 text-secondary"><Icon name="pix" className="h-6 w-6" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2 font-semibold">{pix.label}{pix.badge && <span className="rounded-full bg-secondary/10 px-2 py-0.5 text-[11px] font-semibold text-secondary">{pix.badge}</span>}</span>
                    {pix.description && <span className="block text-[13px] text-muted">{pix.description}</span>}
                  </span>
                </button>
              )}
              {crediario.enabled && (
                <button type="button" role="radio" aria-checked={method === "CREDIARIO"} onClick={() => { setMethod("CREDIARIO"); if (!credStarted.current) { credStarted.current = true; trackOnce("crediario_started", "crediario_started", { valueCents: q.totalCents }); } }} data-cta="method_crediario" className={`flex items-center gap-4 rounded-2xl border p-4 text-left transition ${method === "CREDIARIO" ? "border-primary bg-primary/[0.05]" : "border-line hover:border-ink/25"}`}>
                  <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${method === "CREDIARIO" ? "border-primary" : "border-line"}`}>{method === "CREDIARIO" && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}</span>
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Icon name="gift" className="h-6 w-6" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{crediario.methodLabel}</span>
                    {crediario.methodSubtitle && <span className="block text-[13px] text-muted">{crediario.methodSubtitle}</span>}
                  </span>
                </button>
              )}
            </div>
            {method === "CREDIARIO" && crediario.enabled && (
              <div className="mt-5 border-t border-line pt-5">
                <CrediarioFields
                  cfg={crediario}
                  totalCents={q.totalCents}
                  value={cred}
                  onChange={(v, field) => {
                    setCred(v);
                    setErrors(({ [`crediario.${field}`]: _omit, ...rest }) => rest);
                    const ok = v.protocol.length === crediario.protocolDigits && v.cpfLast3.length === crediario.cpfDigits && parseValidity(v.validity, crediario.validityFormat);
                    if (ok) trackOnce("crediario_data", "crediario_data_completed", { valueCents: q.totalCents });
                  }}
                  errors={Object.fromEntries(Object.entries(errors).filter(([k]) => k.startsWith("crediario.")).map(([k, v]) => [k.slice(10), v]))}
                />
              </div>
            )}
            {checkoutNote && <p className="mt-3 text-sm text-muted">{checkoutNote}</p>}
          </section>

          {/* Resumo (celular) */}
          <section className="card p-5 lg:hidden" aria-label="Resumo do pedido">
            <Summary q={q} />
          </section>

          <label className="flex cursor-pointer items-start gap-3 px-1 text-sm text-muted">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[rgb(var(--c-primary))]" />
            <span>{consentLabel}</span>
          </label>

          {formError && <p className="rounded-2xl bg-danger/10 px-4 py-3 font-semibold text-danger" role="alert">{formError}</p>}

          <div className="lg:hidden">
            <button type="submit" disabled={submitting || cart.loading || availableMethods.length === 0} data-cta="checkout_submit" className="btn-primary w-full">
              {submitLabel}{!submitting && ` · ${formatBRL(q.totalCents)}`}
            </button>
            {legal}
          </div>
          <TrustSeals cnpj={cnpj} companyName={companyName} securityText={securityText} />
        </div>

        <aside className="hidden lg:sticky lg:top-8 lg:block">
          <div className="card p-6">
            <h2 className="font-display text-2xl">Resumo</h2>
            <div className="mt-5">
              <Summary q={q} />
            </div>
            <button type="submit" disabled={submitting || cart.loading || availableMethods.length === 0} data-cta="checkout_submit" className="btn-primary mt-6 w-full">
              {submitLabel}
            </button>
            {legal}
          </div>
        </aside>
      </form>
    </>
  );
}
