import { Badge, Card, Field, PageHeader, inputCls, textareaCls } from "@/components/admin/ui";
import { ActionForm, ConfirmAction, SubmitButton } from "@/components/admin/client";
import { MediaInput } from "@/components/admin/inputs";
import { db } from "@/lib/db";
import { getSettingsFresh } from "@/server/settings";
import { deleteReview, saveReview } from "../cms-actions";
import { saveSettings } from "../sistema-actions";

export const metadata = { title: "Avaliações" };

const STAT_KEYS = ["reviews_enabled", "reviews_section_title", "reviews_rating", "reviews_count", "reviews_count_label", "reviews_hero_proof"] as const;

function StatsForm({ s }: { s: Record<string, string> }) {
  return (
    <ActionForm action={saveSettings} className="grid gap-3 md:grid-cols-2">
      <input type="hidden" name="__keys" value={STAT_KEYS.join(",")} />
      <label className="flex items-center gap-2 text-sm font-medium md:col-span-2"><input type="checkbox" name="reviews_enabled" defaultChecked={s.reviews_enabled !== "false"} className="h-4 w-4" /> Mostrar a seção de avaliações na loja</label>
      <Field label="Título da seção"><input name="reviews_section_title" defaultValue={s.reviews_section_title ?? ""} className={inputCls} /></Field>
      <Field label="Nota média exibida" hint="vazio = calcula pela média real (ex.: 4,8)"><input name="reviews_rating" defaultValue={s.reviews_rating ?? ""} className={inputCls} /></Field>
      <Field label="Total de avaliações exibido" hint="vazio = usa a quantidade cadastrada (use número REAL)"><input name="reviews_count" defaultValue={s.reviews_count ?? ""} className={inputCls} /></Field>
      <Field label="Texto após o total" hint='ex.: "avaliações verificadas"'><input name="reviews_count_label" defaultValue={s.reviews_count_label ?? ""} className={inputCls} /></Field>
      <Field label="Linha de prova no topo do hero" className="md:col-span-2" hint='ex.: "Mais de 2.000 leitores" · vazio = não exibe · use número REAL'><input name="reviews_hero_proof" defaultValue={s.reviews_hero_proof ?? ""} className={inputCls} /></Field>
      <div className="md:col-span-2"><SubmitButton>Salvar configuração</SubmitButton></div>
    </ActionForm>
  );
}
type Review = Awaited<ReturnType<typeof db.review.findMany>>[number];

function ReviewForm({ r, products }: { r: Review | null; products: { id: string; name: string }[] }) {
  return (
    <ActionForm action={saveReview} resetOnSuccess={!r} className="grid gap-3 md:grid-cols-2">
      {r && <input type="hidden" name="id" value={r.id} />}
      <Field label="Nome do cliente"><input name="name" required defaultValue={r?.name ?? ""} className={inputCls} /></Field>
      <Field label="Idade (ex.: 54 anos)" hint="opcional"><input name="ageLabel" defaultValue={r?.ageLabel ?? ""} className={inputCls} /></Field>
      <Field label="Título em negrito" className="md:col-span-2" hint="ex.: Finalmente comida gostosa"><input name="title" defaultValue={r?.title ?? ""} className={inputCls} /></Field>
      <Field label="Texto" className="md:col-span-2"><textarea name="text" required rows={3} defaultValue={r?.text ?? ""} className={textareaCls} /></Field>
      <Field label="Nota (1–5)"><input name="rating" type="number" min={1} max={5} defaultValue={r?.rating ?? 5} className={inputCls} /></Field>
      <Field label="Tempo (ex.: há 3 semanas)" hint="opcional"><input name="timeAgo" defaultValue={r?.timeAgo ?? ""} className={inputCls} /></Field>
      <Field label="Produto">
        <select name="productId" defaultValue={r?.productId ?? ""} className={inputCls}>
          <option value="">—</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Field>
      <Field label="Data da avaliação"><input name="reviewedAt" type="date" defaultValue={r?.reviewedAt ? r.reviewedAt.toISOString().slice(0, 10) : ""} className={inputCls} /></Field>
      <MediaInput name="photoUrl" label="Foto (opcional)" defaultValue={r?.photoUrl} folder="avaliacoes" />
      <MediaInput name="videoUrl" label="Vídeo (opcional)" accept="video/*" defaultValue={r?.videoUrl} folder="avaliacoes" />
      <Field label="Ordem"><input name="sortOrder" type="number" defaultValue={r?.sortOrder ?? 0} className={inputCls} /></Field>
      <div className="space-y-2 md:col-span-2">
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="approved" defaultChecked={r?.approved ?? false} className="h-4 w-4" /> Aprovada (publicar na loja)</label>
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="featured" defaultChecked={r?.featured ?? false} className="h-4 w-4" /> Destaque</label>
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="verified" defaultChecked={r?.verified ?? false} className="h-4 w-4" /> Mostrar selo &quot;Compra verificada&quot; (só marque se for verdade)</label>
        <label className="flex items-start gap-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">
          <input type="checkbox" name="confirmReal" defaultChecked={r?.approved ?? false} className="mt-0.5 h-4 w-4" />
          Confirmo que esta avaliação é real, de um cliente, e que tenho autorização para publicá-la (com foto/vídeo, se houver).
        </label>
      </div>
      <div className="md:col-span-2"><SubmitButton>{r ? "Salvar" : "Cadastrar avaliação"}</SubmitButton></div>
    </ActionForm>
  );
}

export default async function ReviewsAdminPage() {
  const [reviews, products, s] = await Promise.all([
    db.review.findMany({ orderBy: [{ approved: "desc" }, { sortOrder: "asc" }, { createdAt: "desc" }] }),
    db.product.findMany({ select: { id: true, name: true }, orderBy: { sortOrder: "asc" } }),
    getSettingsFresh(),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title="Avaliações" description="Somente avaliações reais dos seus clientes (inclusive da sua própria loja na Shopee ou no Instagram, com autorização). Nota média, total e textos são editáveis abaixo — use sempre números REAIS. A seção aparece na loja quando houver pelo menos uma aprovada." />
      <Card title="Configuração da seção (nota, total, textos)"><StatsForm s={s} /></Card>
      <Card title="Nova avaliação"><ReviewForm r={null} products={products} /></Card>
      {reviews.map((r) => (
        <Card key={r.id} title={`${r.name} · ${"★".repeat(r.rating)}`} actions={r.approved ? <Badge tone="green">publicada</Badge> : <Badge>pendente</Badge>}>
          <ReviewForm r={r} products={products} />
          <div className="mt-3 border-t border-slate-100 pt-3"><ConfirmAction action={deleteReview} label="Remover" danger hidden={{ id: r.id }} /></div>
        </Card>
      ))}
    </div>
  );
}
