"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect } from "react";
import { Icon } from "@/components/ui/Icon";
import { formatBRL } from "@/utils/format";
import type { QuoteBump } from "@/types/catalog";

/**
 * Oferta em destaque antes de gerar o PIX (somente se ativada no order bump). Recusar é tão fácil quanto
 * aceitar (sem dark patterns): o pedido segue normalmente com um toque em "Não, obrigada".
 */
export function OfferModal({ bump, busy, onAccept, onDecline }: { bump: QuoteBump; busy: boolean; onAccept: () => void; onDecline: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onDecline();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onDecline]);

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="offer-title">
      <div className="absolute inset-0 bg-ink/60 backdrop-blur-sm" aria-hidden="true" />
      <div className="relative w-full max-w-md animate-slideup overflow-hidden rounded-t-[2rem] bg-surface shadow-lift sm:animate-pop sm:rounded-[2rem]">
        {bump.imageUrl ? (
          <img src={bump.imageUrl} alt={bump.productName} className="aspect-[16/10] w-full object-cover" />
        ) : (
          <div className="grid aspect-[16/8] place-items-center bg-sand text-secondary">
            <Icon name="book" className="h-12 w-12" strokeWidth={1.2} />
          </div>
        )}
        <div className="p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <p className="eyebrow">Opcional</p>
          <h2 id="offer-title" className="mt-2 font-display text-2xl leading-tight">{bump.modalTitle || bump.title}</h2>
          {bump.description && <p className="mt-2 leading-relaxed text-muted">{bump.description}</p>}
          <div className="mt-4 flex items-baseline gap-3">
            {bump.listPriceCents && <s className="text-muted">{formatBRL(bump.listPriceCents)}</s>}
            <span className="font-display text-4xl text-ink">{formatBRL(bump.priceCents)}</span>
          </div>
          {bump.benefit && <p className="mt-1 text-sm text-secondary">{bump.benefit}</p>}
          <p className="mt-1 text-xs text-muted">Entra no mesmo PIX do seu pedido.</p>
          <button type="button" onClick={onAccept} disabled={busy} data-cta="bump_modal_accept" className="btn-primary mt-5 w-full">
            Sim, quero adicionar
          </button>
          <button type="button" onClick={onDecline} disabled={busy} data-cta="bump_modal_reject" className="btn-light mt-2 w-full">
            Não, obrigada — continuar sem
          </button>
        </div>
      </div>
    </div>
  );
}
