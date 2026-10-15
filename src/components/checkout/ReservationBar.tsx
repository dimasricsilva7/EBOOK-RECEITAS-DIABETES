"use client";

import { useEffect, useState } from "react";

const KEY = "adf_reserve_at";
const WINDOW_MS = 15 * 60_000;

/**
 * Barra de reserva do checkout (urgência honesta): conta 15 minutos a partir da
 * PRIMEIRA vez que a pessoa chega ao checkout e fica guardada no navegador — não
 * reinicia a cada recarga. Ao zerar, NÃO remove nada nem mente que o preço sobe:
 * só muda para uma mensagem tranquila. Serve de lembrete amigável para concluir.
 */
export function ReservationBar({ minutes = 15 }: { minutes?: number }) {
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    const span = Math.max(1, minutes) * 60_000;
    let start = 0;
    try {
      const saved = Number(localStorage.getItem(KEY) ?? 0);
      // reaproveita a reserva em andamento; expira depois do dobro da janela para não ficar eterna
      if (saved && Date.now() - saved < Math.max(span, WINDOW_MS) * 2) start = saved;
      if (!start) {
        start = Date.now();
        localStorage.setItem(KEY, String(start));
      }
    } catch {
      start = Date.now();
    }
    const end = start + span;
    const tick = () => setLeft(Math.max(0, end - Date.now()));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [minutes]);

  if (left == null) return null;
  const mm = Math.floor(left / 60000);
  const ss = Math.floor((left % 60000) / 1000);
  const running = left > 0;

  return (
    <div className={`flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-center text-sm font-semibold ${running ? "bg-accent/10 text-accent" : "bg-success/10 text-success"}`} role="status" aria-live="polite">
      <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="13" r="8" /><path d="M12 9v4l2 2M9 2h6" strokeLinecap="round" />
      </svg>
      {running ? (
        <span>
          Oferta em destaque · tempo para concluir seu pedido: <b className="tabular-nums">{mm}:{String(ss).padStart(2, "0")}</b>
        </span>
      ) : (
        <span>Conseguimos manter sua oferta — finalize seu pedido quando quiser 💛</span>
      )}
    </div>
  );
}
