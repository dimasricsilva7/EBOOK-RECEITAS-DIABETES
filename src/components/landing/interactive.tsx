"use client";

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { trackOnce } from "@/lib/client/tracking";

// ───────────── Ciclo interativo (toque, sem depender de hover) ─────────────

export type CycleStep = { icon?: string; title: string; text?: string; detail?: string };

/**
 * Etapas do ciclo: no celular, lista vertical; no desktop, linha horizontal. Tocar em uma etapa abre a
 * explicação extra (aria-expanded/aria-controls). Não é diagnóstico — o texto da seção deixa isso claro.
 */
export function CycleSteps({ steps }: { steps: CycleStep[] }) {
  const [open, setOpen] = useState(0);
  return (
    <div className="mx-auto mt-12 max-w-5xl">
      <ol className="relative grid gap-3 lg:grid-cols-4 lg:gap-4">
        <span className="pointer-events-none absolute left-[27px] top-6 bottom-6 w-px bg-line lg:left-[12%] lg:right-[12%] lg:top-[27px] lg:bottom-auto lg:h-px lg:w-auto" aria-hidden="true" />
        {steps.map((s, i) => {
          const active = open === i;
          return (
            <li key={i} className="relative">
              <button
                type="button"
                aria-expanded={active}
                aria-controls={`ciclo-${i}`}
                onClick={() => {
                  setOpen(i);
                  trackOnce(`cycle:${i}`, "cta_click", { element: `cycle_step_${i + 1}` });
                }}
                className={`flex w-full items-start gap-4 rounded-2xl border p-3 text-left transition duration-300 lg:flex-col lg:items-center lg:p-5 lg:text-center ${active ? "border-primary/40 bg-surface shadow-soft" : "border-transparent hover:bg-surface/60"}`}
              >
                <span className={`relative z-10 grid h-14 w-14 shrink-0 place-items-center rounded-full border transition duration-300 ${active ? "border-primary bg-primary text-white" : "border-line bg-bg text-primary"}`}>
                  <Icon name={s.icon || "leaf"} className="h-6 w-6" />
                </span>
                <span className="min-w-0 pt-1 lg:pt-0">
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-secondary">Etapa {i + 1}</span>
                  <span className="mt-0.5 block font-display text-xl text-ink">{s.title}</span>
                  {s.text && <span className="mt-1 block text-[15px] leading-relaxed text-muted">{s.text}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {steps.map((s, i) =>
        s.detail ? (
          <div key={i} id={`ciclo-${i}`} role="region" aria-label={`Sobre a etapa ${s.title}`} hidden={open !== i} className="mx-auto mt-5 max-w-3xl animate-rise rounded-2xl bg-surface px-6 py-5 text-[15.5px] leading-relaxed text-ink/85 shadow-soft">
            <p className="flex gap-3">
              <Icon name="sparkle" className="mt-1 h-4 w-4 shrink-0 text-primary" />
              <span>
                <strong className="font-semibold text-ink">{s.title}: </strong>
                {s.detail}
              </span>
            </p>
          </div>
        ) : null
      )}
      <p className="mt-4 text-center text-xs text-muted lg:hidden">Toque em cada etapa para ler mais.</p>
    </div>
  );
}

// ───────────── Galeria do e-book (arrastar, setas, indicadores e ampliação) ─────────────

export type Slide = { id: string; src: string; alt: string; caption?: string | null; contain?: boolean };

export function BookGallery({ slides }: { slides: Slide[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  const go = useCallback((i: number) => {
    const el = track.current;
    if (!el) return;
    const n = Math.max(0, Math.min(slides.length - 1, i));
    const child = el.children[n] as HTMLElement | undefined;
    if (child) el.scrollTo({ left: child.offsetLeft - el.offsetLeft, behavior: "smooth" });
  }, [slides.length]);

  const [scrollable, setScrollable] = useState(false);
  // Posição pela rolagem (funciona com 1 ou várias páginas visíveis ao mesmo tempo)
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const update = () => {
      const first = el.children[0] as HTMLElement | undefined;
      const step = first ? first.offsetWidth + 16 : el.clientWidth;
      setScrollable(el.scrollWidth - el.clientWidth > 4);
      setIndex(Math.max(0, Math.min(slides.length - 1, Math.round(el.scrollLeft / step))));
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [slides]);
  const atEnd = () => {
    const el = track.current;
    return !el || el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
  };

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (zoom !== null && !d.open) d.showModal();
    if (zoom === null && d.open) d.close();
  }, [zoom]);

  if (!slides.length) return null;
  const current = zoom !== null ? slides[zoom] : null;

  return (
    <div className="relative">
      <div
        ref={track}
        className={`-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-4 pb-2 ${scrollable ? "" : "sm:justify-center"} [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden`}
        role="region"
        aria-roledescription="carrossel"
        aria-label="Prévia do e-book"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") go(index + 1);
          if (e.key === "ArrowLeft") go(index - 1);
        }}
      >
        {slides.map((s, i) => (
          <figure key={s.id} data-i={i} className="w-[78%] shrink-0 snap-center sm:w-[46%] lg:w-[31%]" aria-roledescription="slide" aria-label={`${i + 1} de ${slides.length}`}>
            <button type="button" onClick={() => { setZoom(i); trackOnce("gallery_zoom", "cta_click", { element: "gallery_zoom" }); }} className="group relative block w-full overflow-hidden rounded-2xl border border-line bg-surface shadow-soft" aria-label={`Ampliar: ${s.alt}`}>
              <img src={s.src} alt={s.alt} loading={i < 2 ? "eager" : "lazy"} decoding="async" width={600} height={800} className={`aspect-[3/4] w-full transition duration-500 group-hover:scale-[1.02] ${s.contain ? "object-contain p-4" : "object-cover object-top"}`} />
              <span className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-bg/90 text-ink shadow-soft" aria-hidden="true">
                <Icon name="plus" className="h-4 w-4" />
              </span>
            </button>
            {s.caption && <figcaption className="mt-3 px-1 text-sm leading-relaxed text-muted">{s.caption}</figcaption>}
          </figure>
        ))}
      </div>

      {slides.length > 1 && scrollable && (
        <div className="mt-5 flex items-center justify-center gap-4">
          <button type="button" onClick={() => go(index - 1)} disabled={index === 0} className="grid h-11 w-11 place-items-center rounded-full border border-line bg-surface text-ink transition hover:border-ink/30 disabled:opacity-40" aria-label="Página anterior">
            <Icon name="arrow" className="h-4 w-4 rotate-180" />
          </button>
          <div className="flex gap-2" role="tablist" aria-label="Escolher página">
            {slides.map((s, i) => (
              <button key={s.id} type="button" role="tab" aria-selected={index === i} aria-label={`Ir para ${i + 1}`} onClick={() => go(i)} className={`h-2.5 rounded-full transition-all duration-300 ${index === i ? "w-7 bg-primary" : "w-2.5 bg-ink/20"}`} />
            ))}
          </div>
          <button type="button" onClick={() => go(index + 1)} disabled={index === slides.length - 1 && atEnd()} className="grid h-11 w-11 place-items-center rounded-full border border-line bg-surface text-ink transition hover:border-ink/30 disabled:opacity-40" aria-label="Próxima página">
            <Icon name="arrow" className="h-4 w-4" />
          </button>
        </div>
      )}

      <dialog ref={dialog} onClose={() => setZoom(null)} onClick={(e) => e.target === e.currentTarget && setZoom(null)} className="m-auto max-h-[92vh] w-[min(92vw,720px)] overflow-visible bg-transparent p-0 backdrop:bg-ink/80">
        {current && (
          <figure className="relative">
            <img src={current.src} alt={current.alt} className="max-h-[86vh] w-full rounded-2xl bg-surface object-contain" />
            {current.caption && <figcaption className="mt-3 text-center text-sm text-bg/85">{current.caption}</figcaption>}
            <button type="button" onClick={() => setZoom(null)} className="absolute -top-3 right-0 grid h-11 w-11 -translate-y-full place-items-center rounded-full bg-bg text-ink shadow-lift sm:-right-3 sm:top-0 sm:translate-y-[-50%]" aria-label="Fechar">
              <Icon name="plus" className="h-5 w-5 rotate-45" />
            </button>
          </figure>
        )}
      </dialog>
    </div>
  );
}
