"use client";

import { useRef, useState } from "react";
import { track } from "@/lib/client/tracking";

export function SupportForm() {
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const openedAt = useRef(Date.now());
  if (state === "done") {
    return (
      <div className="card p-8" role="status">
        <h2 className="font-display text-2xl">Mensagem enviada</h2>
        <p className="mt-3 leading-relaxed text-muted">Recebemos sua mensagem e vamos responder pelo e-mail informado o quanto antes.</p>
      </div>
    );
  }
  return (
    <form
      className="card space-y-4 p-6 sm:p-8"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setState("loading");
        setError(null);
        try {
          const res = await fetch("/api/suporte", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: fd.get("name"), email: fd.get("email"), orderNumber: fd.get("orderNumber") || null, subject: fd.get("subject"), message: fd.get("message"), hp: fd.get("website") || undefined, elapsedMs: Date.now() - openedAt.current }),
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(json.error ?? "Não foi possível enviar agora.");
          track("support_message");
          setState("done");
        } catch (err) {
          setError(err instanceof Error ? err.message : "Não foi possível enviar agora.");
          setState("idle");
        }
      }}
    >
      <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
        <label htmlFor="website">Site</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="label">Nome</label>
          <input id="name" name="name" required minLength={2} className="input" autoComplete="name" />
        </div>
        <div>
          <label htmlFor="email" className="label">E-mail</label>
          <input id="email" name="email" type="email" required className="input" autoComplete="email" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="orderNumber" className="label">Nº do pedido (se tiver)</label>
          <input id="orderNumber" name="orderNumber" className="input uppercase" placeholder="AF00000-2026" autoComplete="off" />
        </div>
        <div>
          <label htmlFor="subject" className="label">Assunto</label>
          <input id="subject" name="subject" required minLength={3} className="input" />
        </div>
      </div>
      <div>
        <label htmlFor="message" className="label">Mensagem</label>
        <textarea id="message" name="message" required minLength={10} rows={6} className="input h-auto py-3" />
      </div>
      {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
      <button className="btn-primary w-full" disabled={state === "loading"}>{state === "loading" ? "Enviando…" : "Enviar mensagem"}</button>
      <p className="text-xs text-muted">Usamos seus dados apenas para responder esta mensagem.</p>
    </form>
  );
}
