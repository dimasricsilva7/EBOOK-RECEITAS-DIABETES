"use client";

import { useState } from "react";
import { btnSecondary, inputCls } from "@/components/admin/ui";

type Opt = { id?: string; label: string; resultKey: string; weight: number; nextQuestionId: string };

/** Opções de uma pergunta: texto, resultado editorial que reforça (peso) e regra de navegação. */
export function OptionsEditor({ defaultValue, results, questions }: { defaultValue: Opt[]; results: { key: string; title: string }[]; questions: { id: string; title: string }[] }) {
  const [items, setItems] = useState<Opt[]>(defaultValue.length ? defaultValue : [{ label: "", resultKey: "", weight: 1, nextQuestionId: "" }]);
  const set = (i: number, patch: Partial<Opt>) => setItems((l) => l.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  const move = (i: number, d: -1 | 1) =>
    setItems((l) => {
      const n = [...l];
      const j = i + d;
      if (j < 0 || j >= n.length) return l;
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  return (
    <div className="space-y-2">
      <input type="hidden" name="options" value={JSON.stringify(items)} />
      {items.map((o, i) => (
        <div key={o.id ?? `n${i}`} className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 md:grid-cols-[2fr_1.2fr_70px_1.2fr_auto]">
          <input value={o.label} onChange={(e) => set(i, { label: e.target.value })} placeholder={`Opção ${i + 1}`} className={inputCls} aria-label="Texto da opção" />
          <select value={o.resultKey} onChange={(e) => set(i, { resultKey: e.target.value })} className={inputCls} aria-label="Resultado que reforça">
            <option value="">— nenhum resultado —</option>
            {results.map((r) => <option key={r.key} value={r.key}>{r.title}</option>)}
          </select>
          <input type="number" min={0} max={10} value={o.weight} onChange={(e) => set(i, { weight: Number(e.target.value) })} className={inputCls} aria-label="Peso" title="Peso" />
          <select value={o.nextQuestionId} onChange={(e) => set(i, { nextQuestionId: e.target.value })} className={inputCls} aria-label="Depois desta resposta">
            <option value="">Seguir a ordem</option>
            <option value="END">Ir para o fim</option>
            {questions.map((q) => <option key={q.id} value={q.id}>Ir para: {q.title.slice(0, 40)}</option>)}
          </select>
          <div className="flex gap-1">
            <button type="button" onClick={() => move(i, -1)} className="h-10 w-8 rounded border border-slate-300 bg-white text-sm" aria-label="Subir">↑</button>
            <button type="button" onClick={() => move(i, 1)} className="h-10 w-8 rounded border border-slate-300 bg-white text-sm" aria-label="Descer">↓</button>
            <button type="button" onClick={() => setItems((l) => l.filter((_, j) => j !== i))} className="h-10 rounded border border-red-200 bg-white px-2 text-xs font-semibold text-red-600">Remover</button>
          </div>
        </div>
      ))}
      <button type="button" onClick={() => setItems((l) => [...l, { label: "", resultKey: "", weight: 1, nextQuestionId: "" }])} className={btnSecondary}>+ Adicionar opção</button>
      <p className="text-xs text-slate-500">Colunas: texto · resultado editorial que a resposta reforça · peso · navegação (regra aplicada em perguntas de escolha única).</p>
    </div>
  );
}
