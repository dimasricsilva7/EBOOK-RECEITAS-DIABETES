import { Badge, Card, Field, PageHeader, inputCls, textareaCls } from "@/components/admin/ui";
import { ActionForm, ConfirmAction, SubmitButton } from "@/components/admin/client";
import { MediaInput } from "@/components/admin/inputs";
import { db } from "@/lib/db";
import { deleteReview, saveReview } from "../cms-actions";

export const metadata = { title: "Avaliações" };
type Review = Awaited<ReturnType<typeof db.review.findMany>>[number];

function ReviewForm({ r, products }: { r: Review | null; products: { id: string; name: string }[] }) {
  return (
    <ActionForm action={saveReview} resetOnSuccess={!r} className="grid gap-3 md:grid-cols-2">
      {r && <input type="hidden" name="id" value={r.id} />}
      <Field label="Nome do cliente"><input name="name" required defaultValue={r?.name ?? ""} className={inputCls} /></Field>
      <Field label="Produto">
        <select name="productId" defaultValue={r?.productId ?? ""} className={inputCls}>
          <option value="">—</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Field>
      <Field label="Texto" className="md:col-span-2"><textarea name="text" required rows={3} defaultValue={r?.text ?? ""} className={textareaCls} /></Field>
      <Field label="Nota (1–5)"><input name="rating" type="number" min={1} max={5} defaultValue={r?.rating ?? 5} className={inputCls} /></Field>
      <Field label="Data da avaliação"><input name="reviewedAt" type="date" defaultValue={r?.reviewedAt ? r.reviewedAt.toISOString().slice(0, 10) : ""} className={inputCls} /></Field>
      <MediaInput name="photoUrl" label="Foto (opcional)" defaultValue={r?.photoUrl} folder="avaliacoes" />
      <MediaInput name="videoUrl" label="Vídeo (opcional)" accept="video/*" defaultValue={r?.videoUrl} folder="avaliacoes" />
      <Field label="Ordem"><input name="sortOrder" type="number" defaultValue={r?.sortOrder ?? 0} className={inputCls} /></Field>
      <div className="space-y-2 md:col-span-2">
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="approved" defaultChecked={r?.approved ?? false} className="h-4 w-4" /> Aprovada (publicar na loja)</label>
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="featured" defaultChecked={r?.featured ?? false} className="h-4 w-4" /> Destaque</label>
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
  const [reviews, products] = await Promise.all([db.review.findMany({ orderBy: [{ approved: "desc" }, { sortOrder: "asc" }, { createdAt: "desc" }] }), db.product.findMany({ select: { id: true, name: true }, orderBy: { sortOrder: "asc" } })]);
  return (
    <div className="space-y-6">
      <PageHeader title="Avaliações" description="Somente avaliações reais dos seus clientes (inclusive da sua própria loja na Shopee ou no Instagram, com autorização). Fotos e vídeos aceitam upload ou link. A seção aparece na loja quando houver pelo menos uma aprovada." />
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
