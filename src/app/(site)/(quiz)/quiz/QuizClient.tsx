"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { gaEvent, getClientContext, metaCustom, randomId, track, trackOnce } from "@/lib/client/tracking";
import { nextQuestionId, pathFor, rankResults, type QuizData } from "@/lib/quiz";
import { formatBRL } from "@/utils/format";

export type QuizProduct = { name: string; subtitle: string | null; shortDescription: string | null; imageUrl: string | null; priceCents: number; deliveryFormat: string | null };

const KEY = "adf_quiz";

type Saved = {
  id: string;
  versionId: string;
  consent: boolean;
  answers: Record<string, string[]>;
  current: string | null;
  history: string[];
  stage: "intro" | "question" | "lead" | "result";
  leadDone: boolean;
  resultKey: string | null;
  resultTitle?: string | null;
  secondaryKey?: string | null;
  firstName?: string | null;
  updatedAt: number;
};

const fresh = (versionId: string): Saved => ({ id: randomId(32), versionId, consent: false, answers: {}, current: null, history: [], stage: "intro", leadDone: false, resultKey: null, updatedAt: Date.now() });

/** Sessões com mais de 14 dias recomeçam (o progresso fica só neste navegador). */
function load(versionId: string, preview: boolean): Saved {
  if (preview) return fresh(versionId);
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as Saved | null;
    if (s && s.versionId === versionId && Date.now() - (s.updatedAt ?? 0) < 14 * 86_400_000 && s.id) return s;
  } catch {
    /* storage indisponível */
  }
  return fresh(versionId);
}

async function api(body: Record<string, unknown>) {
  const res = await fetch("/api/quiz", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Não foi possível salvar agora. Tente novamente.");
  return json as { ok: true; resultKey?: string };
}

/** Mantém UTMs e click IDs ao seguir do resultado para a página do e-book. */
function carryParams(href: string) {
  if (typeof window === "undefined" || !href.startsWith("/")) return href;
  const keep = new URLSearchParams();
  new URLSearchParams(location.search).forEach((v, k) => {
    if (/^(utm_|fbclid$|gclid$|ttclid$)/.test(k)) keep.set(k, v);
  });
  const qs = keep.toString();
  if (!qs) return href;
  const [path, hash] = href.split("#");
  return `${path}${path.includes("?") ? "&" : "?"}${qs}${hash ? `#${hash}` : ""}`;
}

export function QuizClient({ data, versionId, preview = false, product = null, offerHref = "/e-book" }: { data: QuizData; versionId: string; preview?: boolean; product?: QuizProduct | null; offerHref?: string }) {
  const [s, setS] = useState<Saved>(() => fresh(versionId));
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lead, setLead] = useState({ name: "", email: "", marketing: false });
  const [leadErrors, setLeadErrors] = useState<Record<string, string>>({});
  const [ctaHref, setCtaHref] = useState(offerHref);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const t = data.texts;

  // Recupera a sessão salva neste navegador
  useEffect(() => {
    const saved = load(versionId, preview);
    setS(saved);
    setReady(true);
    trackOnce("quiz_view", "quiz_view");
  }, [versionId, preview]);

  // Persistência local do progresso (só ids — nada de texto das respostas)
  useEffect(() => {
    if (!ready || preview) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...s, updatedAt: Date.now() }));
    } catch {
      /* ignore */
    }
  }, [s, ready, preview]);

  const q = data.questions.find((x) => x.id === s.current) ?? null;
  useEffect(() => {
    setSelected(q ? (s.answers[q.id] ?? []) : []);
    setError(null);
    headingRef.current?.focus();
  }, [q, s.answers, s.stage]);

  const path = useMemo(() => pathFor(data, s.answers), [data, s.answers]);
  const progress = (() => {
    if (s.stage === "result") return 100;
    if (s.stage === "lead") return 96;
    if (!q) return 0;
    const idx = Math.max(0, s.history.length);
    const remaining = data.questions.length - data.questions.findIndex((x) => x.id === q.id) - 1;
    return Math.round((idx / Math.max(1, idx + 1 + remaining)) * 92);
  })();
  const result = data.results.find((r) => r.key === s.resultKey) ?? null;
  const secondary = data.results.find((r) => r.key === s.secondaryKey && r.key !== s.resultKey) ?? null;

  useEffect(() => {
    setCtaHref(carryParams(result?.ctaTarget && result.ctaTarget !== "/" ? result.ctaTarget : offerHref));
  }, [result, offerHref]);

  function start() {
    if (!s.consent) {
      setError("Para começar, confirme o consentimento acima.");
      return;
    }
    const first = data.questions[0]?.id ?? null;
    setS((x) => ({ ...x, stage: "question", current: first, history: [] }));
    metaCustom("QuizStarted", { name: "quiz_started", props: { total: data.questions.length } });
    gaEvent("quiz_started");
    if (!preview) api({ action: "start", sessionId: s.id, consent: true, context: getClientContext() }).catch(() => null);
  }

  async function finish(answers: Record<string, string[]>, leadDone: boolean, firstName: string | null = null) {
    // Captura de lead antes do resultado (se ativada)
    if (t.leadEnabled && !leadDone) {
      setS((x) => ({ ...x, answers, stage: "lead", current: null }));
      return;
    }
    setBusy(true);
    const ranked = rankResults(data, answers);
    let key = ranked.key;
    if (!preview) {
      try {
        const r = await api({ action: "complete", sessionId: s.id });
        if (r.resultKey) key = r.resultKey;
      } catch {
        /* o resultado local é idêntico ao do servidor; segue mesmo se a rede falhar */
      }
    }
    const title = data.results.find((r) => r.key === key)?.title ?? null;
    const secondaryKey = key === ranked.key ? ranked.secondaryKey : null;
    setS((x) => ({ ...x, answers, stage: "result", current: null, resultKey: key, resultTitle: title, secondaryKey, leadDone, firstName: firstName ?? x.firstName ?? null }));
    metaCustom("QuizCompleted", { name: "quiz_completed" });
    gaEvent("quiz_completed");
    track("result_viewed");
    gaEvent("result_viewed");
    setBusy(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function answer(optionIds: string[]) {
    if (!q) return;
    if (!optionIds.length && q.required) {
      setError("Escolha uma opção para continuar.");
      return;
    }
    setError(null);
    const answers = { ...s.answers, [q.id]: optionIds };
    if (!optionIds.length) delete answers[q.id];
    const step = s.history.length + 1;
    metaCustom("QuizStepCompleted", { name: "quiz_step_completed", props: { step, total: data.questions.length } });
    gaEvent("quiz_step_completed", { step });
    if (!preview && optionIds.length) api({ action: "answer", sessionId: s.id, questionId: q.id, optionIds }).catch(() => null);
    const next = nextQuestionId(data, q.id, optionIds);
    if (next) setS((x) => ({ ...x, answers, current: next, history: [...x.history, q.id] }));
    else await finish(answers, s.leadDone);
  }

  function back() {
    if (s.stage === "lead") {
      const last = path.at(-1) ?? data.questions[0]?.id ?? null;
      setS((x) => ({ ...x, stage: "question", current: last, history: x.history.filter((h) => h !== last) }));
      return;
    }
    const prev = s.history.at(-1);
    if (!prev) return setS((x) => ({ ...x, stage: "intro", current: null }));
    setS((x) => ({ ...x, current: prev, history: x.history.slice(0, -1) }));
  }

  async function submitLead(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (lead.name.trim().length < 2) errs.name = "Informe seu nome";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(lead.email.trim())) errs.email = "E-mail inválido";
    setLeadErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      if (!preview) await api({ action: "lead", sessionId: s.id, name: lead.name.trim(), email: lead.email.trim(), marketingConsent: lead.marketing });
      track("quiz_lead_captured");
      setBusy(false);
      await finish(s.answers, true, lead.name.trim().split(/\s+/)[0] || null);
    } catch (err) {
      setLeadErrors({ form: err instanceof Error ? err.message : "Não foi possível salvar agora." });
      setBusy(false);
    }
  }

  function restart() {
    const f = fresh(versionId);
    setS(f);
    setLead({ name: "", email: "", marketing: false });
  }

  if (!ready) return <div className="container-page max-w-2xl flex-1 py-16" aria-busy="true"><div className="h-64 animate-pulse rounded-card bg-ink/5" /></div>;

  return (
    <div className="container-page flex max-w-2xl flex-1 flex-col py-8 sm:py-14">
      {preview && <p className="mb-6 rounded-xl bg-warning/15 px-4 py-2 text-center text-sm font-semibold text-ink">Pré-visualização do rascunho — nada é salvo.</p>}

      {s.stage !== "intro" && (
        <div className="mb-8">
          <div className="flex items-center justify-between text-xs font-medium text-muted">
            <button onClick={back} className="inline-flex min-h-[40px] items-center gap-1.5 hover:text-ink" disabled={busy || s.stage === "result"} aria-label="Voltar">
              {s.stage !== "result" && (
                <>
                  <Icon name="arrow" className="h-4 w-4 rotate-180" /> Voltar
                </>
              )}
            </button>
            <span>{s.stage === "result" ? "Concluído" : s.stage === "lead" ? "Última etapa" : `Pergunta ${s.history.length + 1}`}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sand" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Progresso do quiz">
            <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {s.stage === "intro" && (
        <div className="animate-rise text-center">
          <p className="eyebrow">{t.introEyebrow}</p>
          <h1 ref={headingRef} tabIndex={-1} className="mt-4 font-display text-[2.2rem] leading-[1.1] text-ink outline-none sm:text-5xl">{t.introTitle}</h1>
          <p className="lead mx-auto mt-5 max-w-xl">{t.introText}</p>
          {t.introNote && <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-ink/70">{t.introNote}</p>}
          <label className="mx-auto mt-8 flex max-w-xl cursor-pointer items-start gap-3 rounded-2xl border border-line bg-surface p-4 text-left text-sm leading-relaxed text-ink/85">
            <input type="checkbox" checked={s.consent} onChange={(e) => { setS((x) => ({ ...x, consent: e.target.checked })); setError(null); }} className="mt-0.5 h-5 w-5 shrink-0 accent-[rgb(var(--c-primary))]" />
            <span>
              {t.consentText} <Link href="/politica-de-privacidade" target="_blank" className="underline">Ler política</Link>
            </span>
          </label>
          {error && <p className="mt-3 text-sm font-semibold text-danger" role="alert">{error}</p>}
          <button onClick={start} data-cta="quiz_start" className="btn-primary mt-6 w-full sm:w-auto sm:min-w-[260px]">
            {t.introButton} <Icon name="arrow" className="h-5 w-5" />
          </button>
          {t.introTime && (
            <p className="mt-4 flex items-center justify-center gap-1.5 text-sm text-ink/70">
              <Icon name="clock" className="h-4 w-4 text-secondary" /> {t.introTime}
            </p>
          )}
          <p className="mt-2 text-xs text-muted">{t.privacyNote}</p>
        </div>
      )}

      {s.stage === "question" && q && (
        <div key={q.id} className="animate-rise">
          <h1 ref={headingRef} tabIndex={-1} className="font-display text-[1.9rem] leading-[1.15] text-ink outline-none sm:text-[2.4rem]">{q.title}</h1>
          {q.helpText && <p className="mt-3 text-muted">{q.helpText}</p>}
          {q.type === "multiple" && <p className="mt-2 text-sm font-medium text-secondary">Você pode escolher mais de uma.</p>}
          <div className="mt-8 grid gap-3" role={q.type === "multiple" ? "group" : "radiogroup"} aria-label={q.title}>
            {q.options.map((o) => {
              const on = selected.includes(o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  role={q.type === "multiple" ? "checkbox" : "radio"}
                  aria-checked={on}
                  disabled={busy}
                  onClick={() => {
                    if (q.type === "multiple") setSelected((cur) => (on ? cur.filter((x) => x !== o.id) : [...cur, o.id]));
                    else {
                      setSelected([o.id]);
                      setTimeout(() => answer([o.id]), 220);
                    }
                  }}
                  className={`flex min-h-[64px] w-full items-center gap-4 rounded-2xl border px-5 py-4 text-left text-[16px] leading-snug transition ${on ? "border-primary bg-primary/[0.06] text-ink" : "border-line bg-surface text-ink/90 hover:border-ink/25"}`}
                >
                  <span className={`grid h-6 w-6 shrink-0 place-items-center border-2 ${q.type === "multiple" ? "rounded-md" : "rounded-full"} ${on ? "border-primary bg-primary text-white" : "border-line"}`}>{on && <Icon name="check" className="h-3.5 w-3.5" strokeWidth={2.5} />}</span>
                  {o.label}
                </button>
              );
            })}
          </div>
          {error && <p className="mt-3 text-sm font-semibold text-danger" role="alert">{error}</p>}
          {(q.type === "multiple" || !q.required) && (
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              {q.type === "multiple" && (
                <button onClick={() => answer(selected)} disabled={busy} className="btn-primary w-full sm:w-auto">
                  Continuar <Icon name="arrow" className="h-5 w-5" />
                </button>
              )}
              {!q.required && (
                <button onClick={() => answer([])} disabled={busy} className="btn-ghost">
                  Prefiro não responder
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {s.stage === "lead" && (
        <form onSubmit={submitLead} noValidate className="animate-rise">
          <h1 ref={headingRef} tabIndex={-1} className="font-display text-[1.9rem] leading-[1.15] text-ink outline-none sm:text-[2.4rem]">{t.leadTitle}</h1>
          <p className="lead mt-3">{t.leadText}</p>
          <div className="mt-8 space-y-4">
            <div>
              <label htmlFor="lead-name" className="label">Seu nome</label>
              <input id="lead-name" value={lead.name} onChange={(e) => setLead((l) => ({ ...l, name: e.target.value }))} autoComplete="given-name" className="input" aria-invalid={Boolean(leadErrors.name)} />
              {leadErrors.name && <p className="mt-1 text-sm font-semibold text-danger">{leadErrors.name}</p>}
            </div>
            <div>
              <label htmlFor="lead-email" className="label">Seu e-mail</label>
              <input id="lead-email" type="email" inputMode="email" value={lead.email} onChange={(e) => setLead((l) => ({ ...l, email: e.target.value.trim() }))} autoComplete="email" className="input" aria-invalid={Boolean(leadErrors.email)} />
              {leadErrors.email && <p className="mt-1 text-sm font-semibold text-danger">{leadErrors.email}</p>}
            </div>
            <label className="flex cursor-pointer items-start gap-3 text-sm text-muted">
              <input type="checkbox" checked={lead.marketing} onChange={(e) => setLead((l) => ({ ...l, marketing: e.target.checked }))} className="mt-0.5 h-5 w-5 shrink-0 accent-[rgb(var(--c-primary))]" />
              <span>{t.marketingConsentLabel}</span>
            </label>
          </div>
          {leadErrors.form && <p className="mt-4 rounded-xl bg-danger/10 px-4 py-3 text-sm font-semibold text-danger" role="alert">{leadErrors.form}</p>}
          <button type="submit" disabled={busy} data-cta="quiz_lead_submit" className="btn-primary mt-7 w-full">
            {busy ? "Preparando seu resultado…" : t.leadButton}
          </button>
          {!t.leadRequired && (
            <button type="button" disabled={busy} onClick={() => finish(s.answers, true)} data-cta="quiz_lead_skip" className="btn-ghost mt-2 w-full border border-line">
              {t.leadSkipLabel}
            </button>
          )}
        </form>
      )}

      {s.stage === "result" && (
        <div className="animate-rise">
          {busy && <div className="h-64 animate-pulse rounded-card bg-ink/5" />}
          {result && !busy && (
            <>
              <p className="eyebrow">{t.resultEyebrow}</p>
              <p className="mt-4 text-lg text-ink/80">{s.firstName ? `${s.firstName}, obrigada por compartilhar.` : "Obrigada por compartilhar."}</p>
              <h1 ref={headingRef} tabIndex={-1} className="mt-2 font-display text-[2.1rem] leading-[1.12] text-ink outline-none sm:text-5xl">{result.title}</h1>
              {result.subtitle && <p className="lead mt-4">{result.subtitle}</p>}
              {result.body && (
                <div className="mt-6 space-y-4 text-[1.0625rem] leading-relaxed text-ink/85">
                  {result.body.split(/\n\s*\n/).map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
              )}
              {result.points.length > 0 && (
                <div className="mt-8 rounded-card border border-line bg-surface p-6">
                  <h2 className="font-display text-xl text-ink">O que observamos nas suas respostas</h2>
                  <ul className="mt-4 space-y-3">
                    {result.points.map((p) => (
                      <li key={p} className="flex gap-3 leading-relaxed text-ink/85">
                        <Icon name="leaf" className="mt-1 h-4 w-4 shrink-0 text-secondary" /> {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {secondary && (
                <div className="mt-4 rounded-card border border-line bg-sand/50 p-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-secondary">Também apareceu nas suas respostas</p>
                  <h2 className="mt-2 font-display text-xl text-ink">{secondary.title}</h2>
                  {secondary.subtitle && <p className="mt-2 leading-relaxed text-ink/80">{secondary.subtitle}</p>}
                </div>
              )}
              {result.reflection && (
                <figure className="mt-8 border-l-2 border-accent pl-5">
                  <figcaption className="text-xs font-semibold uppercase tracking-[0.16em] text-secondary">Para refletir</figcaption>
                  <blockquote className="mt-2 font-display text-[1.45rem] italic leading-snug text-ink">{result.reflection}</blockquote>
                </figure>
              )}
              {result.exercise && (
                <div className="mt-8 rounded-card bg-surface p-6 shadow-soft">
                  <h2 className="flex items-center gap-2 font-display text-xl text-ink">
                    <Icon name="pen" className="h-5 w-5 text-primary" /> Um exercício para experimentar
                  </h2>
                  <div className="mt-3 space-y-3 leading-relaxed text-ink/85">
                    {result.exercise.split(/\n\s*\n/).map((p, i) => (
                      <p key={i}>{p}</p>
                    ))}
                  </div>
                </div>
              )}

              <section className="mt-10 overflow-hidden rounded-[2rem] border border-line bg-sand/40">
                <div className="grid gap-6 p-6 sm:grid-cols-[150px_1fr] sm:p-8">
                  {product?.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={product.imageUrl} alt={`Capa: ${product.name}`} className="mx-auto w-32 rounded-lg object-contain shadow-lift sm:w-full" loading="lazy" />
                  ) : (
                    <div className="mx-auto grid aspect-[3/4] w-32 place-items-center rounded-lg bg-ink p-3 text-center font-display text-lg italic leading-tight text-bg shadow-lift sm:w-full" aria-hidden="true">
                      Além da Fome
                    </div>
                  )}
                  <div>
                    <p className="eyebrow">Para continuar no seu ritmo</p>
                    <h2 className="mt-2 font-display text-2xl text-ink">{product?.name ?? "Além da Fome — E-book"}</h2>
                    <p className="mt-2 leading-relaxed text-ink/80">
                      {product?.shortDescription || "Um e-book educativo para reconhecer padrões, compreender melhor suas emoções e explorar formas mais conscientes de cuidar de si — sem culpa e sem regras rígidas."}
                    </p>
                    {product && (
                      <p className="mt-3 text-sm text-muted">
                        {product.deliveryFormat ? `${product.deliveryFormat} · ` : ""}
                        {formatBRL(product.priceCents)}
                      </p>
                    )}
                  </div>
                </div>
              </section>
              <Link href={ctaHref} data-cta="quiz_result_cta" onClick={() => track("quiz_cta_click")} className="btn-primary mt-6 w-full">
                {result.ctaLabel || "Conhecer o e-book Além da Fome"} <Icon name="arrow" className="h-5 w-5" />
              </Link>
              <p className="mt-6 flex gap-2 rounded-2xl bg-sand/70 p-4 text-xs leading-relaxed text-muted">
                <Icon name="info" className="h-4 w-4 shrink-0 text-secondary" /> {t.resultDisclaimer}
              </p>
              <button onClick={restart} className="btn-ghost mt-3 w-full text-muted">
                Refazer o quiz
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
