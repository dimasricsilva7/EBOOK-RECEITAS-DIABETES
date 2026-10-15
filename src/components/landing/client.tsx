"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { Icon } from "@/components/ui/Icon";
import { metaCustom, metaEvent, track, trackOnce } from "@/lib/client/tracking";

const QUIZ_KEY = "adf_quiz";

/** Sessão do quiz guardada neste navegador (id + chave do resultado editorial, nada além disso). */
export function readQuizLocal(): { id?: string; resultKey?: string | null; resultTitle?: string | null } {
  try {
    return JSON.parse(localStorage.getItem(QUIZ_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function quizStage(stage: "offer" | "checkout") {
  const q = readQuizLocal();
  if (!q.id) return;
  const body = JSON.stringify({ action: stage === "offer" ? "offer_view" : "checkout_started", sessionId: q.id });
  fetch("/api/quiz", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
}

/** landing_view + profundidade de rolagem (25/50/75/90) — uma vez por página. */
export function LandingTracker({ product }: { product: { id: string; sku: string; name: string; priceCents: number } | null }) {
  useEffect(() => {
    trackOnce("landing", "landing_view");
    if (product) metaEvent("ViewContent", { content_ids: [product.sku], content_name: product.name, content_type: "product", value: product.priceCents / 100, currency: "BRL" }, { mirror: true, internal: { name: "product_view", productId: product.id, valueCents: product.priceCents } });
    const fired = new Set<number>();
    const on = () => {
      const h = document.documentElement;
      const pct = ((h.scrollTop + innerHeight) / h.scrollHeight) * 100;
      for (const p of [25, 50, 75, 90]) {
        if (pct >= p && !fired.has(p)) {
          fired.add(p);
          track(`scroll_${p}` as "scroll_25");
        }
      }
    };
    addEventListener("scroll", on, { passive: true });
    return () => removeEventListener("scroll", on);
  }, [product]);
  return null;
}

/** Dispara offer_view (próprio + Meta OfferViewed, sem parâmetros) quando a oferta aparece na tela. */
export function OfferViewTracker({ productId, valueCents, children, className, id }: { productId: string | null; valueCents: number | null; children: React.ReactNode; className?: string; id?: string }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        metaCustom("OfferViewed", { name: "offer_view", productId, valueCents });
        quizStage("offer");
      },
      { threshold: 0.3 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [productId, valueCents]);
  return (
    <section ref={ref} id={id} className={className}>
      {children}
    </section>
  );
}

/** Botão de compra: o pedido passa a conter o produto principal e segue para o checkout. */
export function BuyButton({ product, label, element, className = "btn-primary", disabledText }: { product: { id: string; sku: string; name: string; priceCents: number } | null; label: string; element: string; className?: string; disabledText?: string | null }) {
  const cart = useCart();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (!product || disabledText) {
    return (
      <p className="rounded-2xl bg-sand px-5 py-4 text-center text-sm font-medium text-ink/80" role="status">
        {disabledText || "Em breve."}
      </p>
    );
  }
  return (
    <button
      type="button"
      data-cta={element}
      data-product={product.id}
      disabled={busy}
      onClick={() => {
        setBusy(true);
        cart.buyNow(product, element);
        quizStage("checkout");
        router.push("/checkout");
      }}
      className={className}
    >
      {busy ? "Abrindo checkout…" : label}
      {!busy && <Icon name="arrow" className="h-5 w-5" />}
    </button>
  );
}

/** Link de rolagem para a oferta (CTA intermediários). */
export function ScrollCta({ label, target = "#oferta", className = "btn-primary", element }: { label: string; target?: string; className?: string; element: string }) {
  return (
    <a href={target} data-cta={element} className={className}>
      {label}
      <Icon name="arrow" className="h-5 w-5" />
    </a>
  );
}

/** CTA fixo no celular: aparece depois da primeira dobra e some sobre a oferta e o rodapé. */
export function StickyMobileCTA({ label }: { label: string }) {
  const [show, setShow] = useState(false);
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    const on = () => setShow(window.scrollY > window.innerHeight * 0.9);
    on();
    addEventListener("scroll", on, { passive: true });
    const targets = [document.getElementById("oferta"), document.querySelector("footer")].filter(Boolean) as Element[];
    const visible = new Set<Element>();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => (e.isIntersecting ? visible.add(e.target) : visible.delete(e.target)));
      setBlocked(visible.size > 0);
    });
    targets.forEach((t) => io.observe(t));
    return () => {
      removeEventListener("scroll", on);
      io.disconnect();
    };
  }, []);
  if (!show || blocked) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 animate-slideup border-t border-line bg-bg/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur lg:hidden">
      <a href="#oferta" data-cta="sticky_mobile_cta" className="btn-primary w-full">
        {label}
      </a>
    </div>
  );
}

export function FaqItem({ q, a, i }: { q: string; a: React.ReactNode; i: number }) {
  return (
    <details className="group border-b border-line py-1" onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && trackOnce(`faq:${i}`, "faq_open", { props: { i } })}>
      <summary className="flex min-h-[60px] cursor-pointer list-none items-center justify-between gap-4 py-4 text-left font-display text-lg text-ink [&::-webkit-details-marker]:hidden">
        {q}
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line text-primary transition group-open:rotate-45" aria-hidden="true">
          <Icon name="plus" className="h-4 w-4" />
        </span>
      </summary>
      <div className="pb-6 pr-10 text-[15px] leading-relaxed text-muted">{a}</div>
    </details>
  );
}

/**
 * Faixa personalizada para quem veio do quiz: reconhece o resultado editorial guardado neste navegador.
 * Não é diagnóstico; só conecta o conteúdo ao que a pessoa compartilhou.
 */
export function QuizWelcome({ texts }: { texts: Record<string, { title: string; subtitle: string | null }> }) {
  const [r, setR] = useState<{ title: string; subtitle: string | null } | null>(null);
  useEffect(() => {
    const q = readQuizLocal();
    if (q.resultKey && texts[q.resultKey]) setR(texts[q.resultKey]);
  }, [texts]);
  if (!r) return null;
  return (
    <div className="border-b border-line bg-sand/70">
      <div className="container-page flex items-start gap-3 py-4 text-sm sm:items-center">
        <Icon name="sparkle" className="mt-0.5 h-5 w-5 shrink-0 text-secondary sm:mt-0" />
        <p className="text-ink/85">
          <span className="font-semibold">Pelo que você compartilhou no quiz:</span> {r.title}. {r.subtitle ? <span className="text-muted">{r.subtitle}</span> : null}
        </p>
      </div>
    </div>
  );
}
