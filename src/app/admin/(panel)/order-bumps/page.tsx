import { Badge, Card, Field, PageHeader, inputCls, textareaCls } from "@/components/admin/ui";
import { ActionForm, ConfirmAction, SubmitButton } from "@/components/admin/client";
import { MediaInput, ProductMultiSelect } from "@/components/admin/inputs";
import { db } from "@/lib/db";
import { centsToInput } from "@/server/admin/forms";
import { formatBRL } from "@/utils/format";
import { deleteBump, saveBump } from "../ofertas-actions";

export const metadata = { title: "Order bumps" };

type Bump = Awaited<ReturnType<typeof db.orderBump.findMany>>[number];
type Prod = { id: string; name: string; active: boolean; priceCents: number };

function BumpForm({ b, products }: { b: Bump | null; products: Prod[] }) {
  const triggers = Array.isArray(b?.triggerProductIds) ? (b!.triggerProductIds as string[]) : [];
  return (
    <ActionForm action={saveBump} resetOnSuccess={!b} className="grid gap-3 md:grid-cols-2">
      {b && <input type="hidden" name="id" value={b.id} />}
      <Field label="Nome interno"><input name="name" defaultValue={b?.name ?? ""} className={inputCls} /></Field>
      <Field label="Produto">
        <select name="productId" defaultValue={b?.productId ?? ""} required className={inputCls}>
          <option value="">Selecione…</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}{p.priceCents ? ` · ${formatBRL(p.priceCents)}` : " · sem preço"}{p.active ? "" : " (inativo)"}</option>)}
        </select>
      </Field>
      <Field label="Título (exibido no checkout)" className="md:col-span-2"><input name="title" required defaultValue={b?.title ?? ""} placeholder="Adicione 50 modelos extras" className={inputCls} /></Field>
      <Field label="Descrição" className="md:col-span-2"><textarea name="description" rows={2} defaultValue={b?.description ?? ""} className={textareaCls} /></Field>
      <Field label="Texto do benefício"><input name="benefit" defaultValue={b?.benefit ?? ""} className={inputCls} /></Field>
      <Field label="Preço no bump (R$)" hint="vazio = preço atual do produto"><input name="price" inputMode="decimal" defaultValue={centsToInput(b?.priceCents)} className={inputCls} /></Field>
      <div className="md:col-span-2"><MediaInput name="imageUrl" label="Imagem (opcional)" defaultValue={b?.imageUrl} folder="bumps" /></div>
      <Field label="Posição"><input name="sortOrder" type="number" defaultValue={b?.sortOrder ?? 0} className={inputCls} /></Field>
      <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium"><input type="checkbox" name="active" defaultChecked={b?.active ?? true} className="h-4 w-4" /> Ativo</label>
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 md:col-span-2">
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="showModal" defaultChecked={b?.showModal ?? false} className="h-4 w-4" /> Oferta em destaque: abrir modal com imagem antes de gerar o PIX</label>
        <p className="mt-1 text-xs text-slate-600">Aparece uma vez por checkout, só se o cliente ainda não marcou este bump. O desconto exibido é calculado entre o preço do produto e o preço do bump — use um preço de produto real.</p>
        <input name="modalTitle" defaultValue={b?.modalTitle ?? ""} placeholder="Título do modal (ex.: Espere! Leve com 60% de desconto)" className={`${inputCls} mt-2`} />
      </div>
      <div className="md:col-span-2">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Regra: mostrar somente quando o carrinho contiver…</p>
        <ProductMultiSelect name="triggerProductIds" products={products} defaultValue={triggers} />
        <p className="mt-1 text-xs text-slate-500">Nenhum selecionado = mostra sempre. Nunca aparece se o produto já estiver no pedido ou incluso no plano.</p>
      </div>
      <div className="md:col-span-2"><SubmitButton>{b ? "Salvar" : "Criar order bump"}</SubmitButton></div>
    </ActionForm>
  );
}

export default async function BumpsPage() {
  const [bumps, products] = await Promise.all([
    db.orderBump.findMany({ include: { product: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    db.product.findMany({ select: { id: true, name: true, active: true, priceCents: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title="Order bumps" description="Ofertas opcionais no checkout — sempre desmarcadas por padrão (sem dark patterns)." />
      {bumps.map((b) => (
        <Card
          key={b.id}
          title={`${b.sortOrder}. ${b.name}`}
          actions={
            <span className="flex items-center gap-2">
              {b.active ? <Badge tone="green">ativo</Badge> : <Badge>inativo</Badge>}
              {b.showModal && <Badge tone="blue">modal</Badge>}
              {(!b.product.active || b.product.priceCents <= 0) && <Badge tone="amber">produto indisponível — não aparece</Badge>}
            </span>
          }
        >
          <BumpForm b={b} products={products} />
          <div className="mt-3 border-t border-slate-100 pt-3"><ConfirmAction action={deleteBump} label="Excluir bump" danger hidden={{ id: b.id }} /></div>
        </Card>
      ))}
      <Card title="Novo order bump"><BumpForm b={null} products={products} /></Card>
    </div>
  );
}
