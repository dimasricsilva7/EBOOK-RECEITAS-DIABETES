"use client";

import { useEffect } from "react";

/** Falha ao montar a página (ex.: banco demorando para acordar): tenta de novo sozinho, uma vez. */
export default function StoreError({ reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    const key = "adf_auto_retry";
    let tried = false;
    try {
      tried = Date.now() - Number(sessionStorage.getItem(key) ?? 0) < 30_000;
      if (!tried) sessionStorage.setItem(key, String(Date.now()));
    } catch {
      /* ignore */
    }
    if (!tried) {
      const t = setTimeout(() => window.location.reload(), 1500);
      return () => clearTimeout(t);
    }
  }, []);
  return (
    <div className="container-page flex min-h-[70svh] flex-col items-center justify-center py-16 text-center">
      <p className="font-display text-2xl">Só um instante, estamos carregando…</p>
      <button onClick={() => (reset(), window.location.reload())} className="btn-primary mt-6">
        Tentar de novo
      </button>
    </div>
  );
}
