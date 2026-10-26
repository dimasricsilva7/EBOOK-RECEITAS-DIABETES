"use client";

import { useEffect, useState } from "react";

type Purchase = { name: string; product: string; when: string };

/**
 * Balões de compra (prova social). Mostra compras reais pagas + notificações cadastradas
 * no admin. Um a cada ~10s. Se a lista estiver vazia, não aparece nada.
 */
export function RecentPurchases() {
  const [list, setList] = useState<Purchase[]>([]);
  const [idx, setIdx] = useState(0);
  const [show, setShow] = useState(false);

  useEffect(() => {
    fetch("/api/recent-purchases", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setList(Array.isArray(d.purchases) ? d.purchases : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!list.length) return;
    let i = 0;
    let hide: ReturnType<typeof setTimeout>;
    const cycle = () => {
      setIdx(i % list.length);
      setShow(true);
      i++;
      hide = setTimeout(() => setShow(false), 6000);
    };
    const first = setTimeout(cycle, 3000);
    const iv = setInterval(cycle, 10000);
    return () => {
      clearTimeout(first);
      clearTimeout(hide);
      clearInterval(iv);
    };
  }, [list]);

  if (!list.length) return null;
  const p = list[idx];
  if (!p) return null;
  return (
    <div className={`fixed bottom-4 left-4 z-40 max-w-[85vw] transition-all duration-500 sm:max-w-xs ${show ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"}`} aria-live="polite">
      <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 shadow-lift">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 13l4 4L19 7" /></svg>
        </span>
        <div className="min-w-0 text-sm">
          <p className="truncate text-ink"><span className="font-bold">{p.name}</span> comprou o <span className="font-semibold">{p.product}</span></p>
          <p className="text-xs text-muted">{p.when} · compra verificada</p>
        </div>
      </div>
    </div>
  );
}
