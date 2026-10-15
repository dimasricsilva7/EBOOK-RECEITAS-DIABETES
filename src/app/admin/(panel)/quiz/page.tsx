import Link from "next/link";
import { Badge, Card, EmptyState, Field, PageHeader, btnSecondary, inputCls, textareaCls } from "@/components/admin/ui";
import { ActionForm, ConfirmAction, SubmitButton } from "@/components/admin/client";
import { StringListEditor } from "@/components/admin/inputs";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { QUIZ_TEXT_DEFAULTS, type QuizTexts } from "@/lib/quiz";
import { formatDate } from "@/utils/format";
import { buildDraftQuiz, draftTexts, getPublishedQuiz, validateQuiz } from "@/server/quiz";
import { deleteQuestion, deleteResult, moveQuestion, publishQuizAction, saveQuestion, saveQuizTexts, saveResult, toggleQuestion } from "./actions";
import { OptionsEditor } from "./OptionsEditor";

export const metadata = { title: "Editor do Quiz" };
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

const TEXT_FIELDS: { k: keyof QuizTexts; label: string; long?: boolean }[] = [
  { k: "introEyebrow", label: "Abertura — chamada" },
  { k: "introTitle", label: "Abertura — título" },
  { k: "introText", label: "Abertura — texto", long: true },
  { k: "introNote", label: "Abertura — texto complementar" },
  { k: "introButton", label: "Abertura — botão" },
  { k: "introTime", label: "Abertura — tempo estimado" },
  { k: "consentText", label: "Consentimento para tratar as respostas (obrigatório para começar)", long: true },
  { k: "privacyNote", label: "Nota de privacidade" },
  { k: "leadTitle", label: "Captura — título" },
  { k: "leadText", label: "Captura — texto", long: true },
  { k: "leadButton", label: "Captura — botão" },
  { k: "leadSkipLabel", label: "Captura — link para pular (se não obrigatória)" },
  { k: "marketingConsentLabel", label: "Captura — consentimento de marketing (opcional)" },
  { k: "resultEyebrow", label: "Resultado — chamada" },
  { k: "resultDisclaimer", label: "Resultado — aviso (não é diagnóstico)", long: true },
  { k: "fallbackResultKey", label: "Resultado padrão (empate ou sem pontuação) — chave" },
];

export default async function QuizEditorPage() {
  const admin = await requireAdmin();
  if (admin.role === "EDITOR") return <EmptyState title="Acesso restrito" text="O quiz é editado por administradores." />;
  const [questions, results, texts, draft, published, versions] = await Promise.all([
    db.quizQuestion.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], include: { options: { orderBy: { sortOrder: "asc" } } } }),
    db.quizResult.findMany({ orderBy: [{ sortOrder: "asc" }] }),
    draftTexts(),
    buildDraftQuiz(),
    getPublishedQuiz(),
    db.quizVersion.findMany({ orderBy: { publishedAt: "desc" }, take: 5, select: { id: true, publishedAt: true, _count: { select: { sessions: true } } } }),
  ]);
  const errors = validateQuiz(draft);
  const resultOpts = results.filter((r) => r.active).map((r) => ({ key: r.key, title: r.title }));
  const small = "rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium hover:bg-slate-50";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Editor do Quiz"
        description={published ? `Versão publicada em ${formatDate(new Date(published.publishedAt), true)}. Edite o rascunho abaixo e publique para valer no site.` : "Nenhuma versão publicada ainda — o quiz não aparece no site até você publicar."}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/quiz?preview=1" target="_blank" className={btnSecondary}>Visualizar rascunho</Link>
            <ActionForm action={publishQuizAction} className="contents">
              <SubmitButton pendingText="Publicando…">Publicar no site</SubmitButton>
            </ActionForm>
          </div>
        }
      />

      {errors.length > 0 ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">O rascunho ainda não pode ser publicado:</p>
          <ul className="mt-1 list-disc pl-5">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      ) : (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Rascunho válido: {draft.questions.length} pergunta(s) ativa(s), {draft.results.length} resultado(s). Visualize antes de publicar.</p>
      )}

      <Card title={`Perguntas (${questions.length})`}>
        <div className="space-y-3">
          {questions.map((q, i) => (
            <details key={q.id} className="rounded-xl border border-slate-200 p-3">
              <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-slate-400">{i + 1}</span>
                <span className="min-w-0 flex-1 font-semibold">{q.title}</span>
                {!q.active && <Badge>inativa</Badge>}
                {q.required ? <Badge tone="blue">obrigatória</Badge> : <Badge>opcional</Badge>}
                <Badge>{q.type === "multiple" ? "múltipla" : "única"}</Badge>
                <span className="text-xs text-slate-500">{q.options.length} opções</span>
              </summary>
              <div className="mt-3 flex flex-wrap gap-1">
                <form action={moveQuestion}><input type="hidden" name="id" value={q.id} /><input type="hidden" name="dir" value="up" /><button className={small}>↑ Subir</button></form>
                <form action={moveQuestion}><input type="hidden" name="id" value={q.id} /><input type="hidden" name="dir" value="down" /><button className={small}>↓ Descer</button></form>
                <form action={toggleQuestion}><input type="hidden" name="id" value={q.id} /><button className={small}>{q.active ? "Desativar" : "Ativar"}</button></form>
              </div>
              <ActionForm action={saveQuestion} className="mt-3 space-y-3">
                <input type="hidden" name="id" value={q.id} />
                <Field label="Pergunta"><input name="title" defaultValue={q.title} className={inputCls} /></Field>
                <Field label="Texto de apoio (opcional)"><input name="helpText" defaultValue={q.helpText ?? ""} className={inputCls} /></Field>
                <div className="flex flex-wrap gap-4 text-sm">
                  <label className="flex items-center gap-2"><input type="checkbox" name="required" defaultChecked={q.required} className="h-4 w-4" /> Obrigatória</label>
                  <label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={q.active} className="h-4 w-4" /> Ativa</label>
                  <label className="flex items-center gap-2">Tipo <select name="type" defaultValue={q.type} className={`${inputCls} w-auto`}><option value="single">Escolha única</option><option value="multiple">Múltipla escolha</option></select></label>
                </div>
                <OptionsEditor defaultValue={q.options.map((o) => ({ id: o.id, label: o.label, resultKey: o.resultKey ?? "", weight: o.weight, nextQuestionId: o.nextQuestionId ?? "" }))} results={resultOpts} questions={questions.filter((x) => x.id !== q.id).map((x) => ({ id: x.id, title: x.title }))} />
                <SubmitButton>Salvar pergunta</SubmitButton>
              </ActionForm>
              <div className="mt-3">
                <ConfirmAction action={deleteQuestion} label="Excluir pergunta" danger description="Remove a pergunta do rascunho. Respostas antigas continuam no histórico dos leads." hidden={{ id: q.id }} />
              </div>
            </details>
          ))}
        </div>
        <details className="mt-4 rounded-xl border border-dashed border-slate-300 p-3">
          <summary className="cursor-pointer text-sm font-semibold">+ Nova pergunta</summary>
          <ActionForm action={saveQuestion} className="mt-3 space-y-3" resetOnSuccess>
            <Field label="Pergunta"><input name="title" className={inputCls} /></Field>
            <Field label="Texto de apoio (opcional)"><input name="helpText" className={inputCls} /></Field>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" name="required" defaultChecked className="h-4 w-4" /> Obrigatória</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked className="h-4 w-4" /> Ativa</label>
              <label className="flex items-center gap-2">Tipo <select name="type" className={`${inputCls} w-auto`}><option value="single">Escolha única</option><option value="multiple">Múltipla escolha</option></select></label>
            </div>
            <OptionsEditor defaultValue={[]} results={resultOpts} questions={questions.map((x) => ({ id: x.id, title: x.title }))} />
            <SubmitButton>Criar pergunta</SubmitButton>
          </ActionForm>
        </details>
      </Card>

      <Card title={`Resultados editoriais (${results.length})`}>
        <p className="mb-3 text-sm text-slate-600">Cada resultado reconhece o que a pessoa compartilhou e apresenta conteúdo educativo. <b>Nunca</b> afirme diagnóstico, transtorno ou cura.</p>
        <div className="space-y-3">
          {[...results, null].map((r) => (
            <details key={r?.id ?? "new"} className={`rounded-xl border p-3 ${r ? "border-slate-200" : "border-dashed border-slate-300"}`}>
              <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                {r ? (
                  <>
                    <span className="font-semibold">{r.title}</span>
                    <code className="rounded bg-slate-100 px-1.5 text-xs">{r.key}</code>
                    {!r.active && <Badge>inativo</Badge>}
                  </>
                ) : (
                  <span className="text-sm font-semibold">+ Novo resultado</span>
                )}
              </summary>
              <ActionForm action={saveResult} className="mt-3 grid gap-3 md:grid-cols-2" resetOnSuccess={!r}>
                {r && <input type="hidden" name="id" value={r.id} />}
                <Field label="Chave (usada nas opções)"><input name="key" defaultValue={r?.key ?? ""} placeholder="estresse" className={inputCls} /></Field>
                <Field label="Ordem"><input name="sortOrder" type="number" defaultValue={r?.sortOrder ?? 0} className={inputCls} /></Field>
                <Field label="Título" className="md:col-span-2"><input name="title" defaultValue={r?.title ?? ""} className={inputCls} /></Field>
                <Field label="Subtítulo" className="md:col-span-2"><input name="subtitle" defaultValue={r?.subtitle ?? ""} className={inputCls} /></Field>
                <Field label="Texto" className="md:col-span-2" hint="Parágrafos separados por linha em branco."><textarea name="body" rows={5} defaultValue={r?.body ?? ""} className={textareaCls} /></Field>
                <div className="md:col-span-2"><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Fatores observados (pontos educativos)</p><StringListEditor name="points" defaultValue={arr(r?.points)} addLabel="Adicionar ponto" /></div>
                <Field label="Pergunta de reflexão" className="md:col-span-2"><textarea name="reflection" rows={2} defaultValue={r?.reflection ?? ""} className={textareaCls} /></Field>
                <Field label="Exercício prático" className="md:col-span-2" hint="Nunca sugira restringir comida ou adiar refeições."><textarea name="exercise" rows={4} defaultValue={r?.exercise ?? ""} className={textareaCls} /></Field>
                <Field label="Texto do botão"><input name="ctaLabel" defaultValue={r?.ctaLabel ?? "Conhecer o Além da Fome"} className={inputCls} /></Field>
                <Field label="Destino do botão"><input name="ctaTarget" defaultValue={r?.ctaTarget ?? "/e-book"} className={inputCls} /></Field>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={r?.active ?? true} className="h-4 w-4" /> Ativo</label>
                <div className="md:col-span-2"><SubmitButton>{r ? "Salvar resultado" : "Criar resultado"}</SubmitButton></div>
              </ActionForm>
              {r && <div className="mt-3"><ConfirmAction action={deleteResult} label="Excluir resultado" danger description="Opções que apontavam para ele ficam sem resultado." hidden={{ id: r.id }} /></div>}
            </details>
          ))}
        </div>
      </Card>

      <Card title="Textos, captura de lead e privacidade">
        <ActionForm action={saveQuizTexts} className="grid gap-3 md:grid-cols-2">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="leadEnabled" defaultChecked={texts.leadEnabled} className="h-4 w-4" /> Pedir nome e e-mail antes do resultado</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="leadRequired" defaultChecked={texts.leadRequired} className="h-4 w-4" /> Captura obrigatória (sem opção de pular)</label>
          {TEXT_FIELDS.map((f) => (
            <Field key={f.k} label={f.label} className={f.long ? "md:col-span-2" : ""}>
              {f.long ? <textarea name={f.k} rows={3} defaultValue={String(texts[f.k] ?? QUIZ_TEXT_DEFAULTS[f.k])} className={textareaCls} /> : <input name={f.k} defaultValue={String(texts[f.k] ?? QUIZ_TEXT_DEFAULTS[f.k])} className={inputCls} />}
            </Field>
          ))}
          <div className="md:col-span-2"><SubmitButton>Salvar textos</SubmitButton></div>
        </ActionForm>
      </Card>

      <Card title="Versões publicadas">
        {versions.length ? (
          <ul className="space-y-1 text-sm">
            {versions.map((v, i) => (
              <li key={v.id}>{formatDate(v.publishedAt, true)} · {v._count.sessions} sessão(ões){i === 0 && <> · <Badge tone="green">no ar</Badge></>}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">Nenhuma versão publicada.</p>
        )}
      </Card>
    </div>
  );
}
