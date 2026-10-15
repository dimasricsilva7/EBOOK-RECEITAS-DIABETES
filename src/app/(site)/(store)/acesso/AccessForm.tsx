"use client";

import { useState } from "react";
import { track } from "@/lib/client/tracking";

export function AccessForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  if (state === "done") {
    return (
      <p className="mt-8 rounded-2xl border border-line bg-surface p-5 leading-relaxed text-ink/85" role="status">
        Pronto. Se existir uma compra confirmada com <b>{email}</b>, o link de acesso chega em alguns minutos.
      </p>
    );
  }
  return (
    <form
      className="mt-8 space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return setError("Informe um e-mail válido.");
        setState("loading");
        setError(null);
        try {
          const res = await fetch("/api/acesso/reenviar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim() }) });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(json.error ?? "Não foi possível enviar agora.");
          track("access_resend_requested");
          setState("done");
        } catch (err) {
          setError(err instanceof Error ? err.message : "Não foi possível enviar agora.");
          setState("idle");
        }
      }}
    >
      <div>
        <label htmlFor="email" className="label">E-mail da compra</label>
        <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="input" autoComplete="email" inputMode="email" />
      </div>
      {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
      <button className="btn-primary w-full" disabled={state === "loading"}>{state === "loading" ? "Enviando…" : "Enviar meu link de acesso"}</button>
    </form>
  );
}
