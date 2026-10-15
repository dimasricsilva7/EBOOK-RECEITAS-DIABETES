import { Badge, Card, Field, PageHeader, inputCls, textareaCls } from "@/components/admin/ui";
import { ActionForm, ConfirmAction, SubmitButton } from "@/components/admin/client";
import { MediaInput } from "@/components/admin/inputs";
import { db } from "@/lib/db";
import { centsToInput } from "@/server/admin/forms";
import { formatBRL } from "@/utils/format";
import { deleteDownsell, saveDownsell } from "../ofertas-actions";

export const metadata = { title: "Downsells" };

type Down = Awaited<ReturnType<typeof db.downsell.findMany>>[number] & { product: { name: string; active: boolean; priceCents: number } };
type Up = { id: string; name: string; title: string };
type Prod = { id: string; name: string; active: boolean; priceCents: number };

function DownsellForm({ d, upsells, products, usedUpsellIds }: { d: Down | null; upsells: Up[]; products: Prod[]; usedUpsellIds: string[] }) {
  // Um downsell por upsell: na criação, só mostra upsells ainda sem downsell.
  const options = upsells.filter((u) => d?.upsellId === u.id || !usedUpsellIds.includes(u.id));
  return (
    <ActionForm action={saveDownsell} resetOnSuccess={!d} className="grid gap-3 md:grid-cols-2">
      {d && <input type="hidden" name="id" value={d.id} />}
      <Field label="Nome interno"><input name="name" defaultValue={d?.name ?? ""} className={inputCls} /></Field>
      <Field label="Upsell correspondente" hint="o downsell aparece quando ESTE upsell é recusado">
        <select name="upsellId" defaultValue={d?.upsellId ?? ""} required className={inputCls}>
          <option value="">Selecione…</option>
          {options.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </Field>
      <Field label="Produto oferecido">
        <select name="productId" defaultValue={d?.productId ?? ""} required className={inputCls}>
          <option value="">Selecione…</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}{p.priceCents ? ` · ${formatBRL(p.priceCents)}` : " · sem preço"}{p.active ? "" : " (inativo)"}</option>)}
        </select>
      </Field>
      <Field label="Preço (R$)" hint="vazio = preço atual do produto · mínimo R$ 5,00 (PIX)"><input name="price" inputMode="decimal" defaultValue={centsToInput(d?.priceCents)} className={inputCls} /></Field>
      <Field label="Chamada" className="md:col-span-2"><input name="headline" required defaultValue={d?.headline ?? ""} placeholder="Prefere começar com uma versão mais enxuta?" className={inputCls} /></Field>
      <Field label="Título"><input name="title" required defaultValue={d?.title ?? ""} className={inputCls} /></Field>
      <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="active" defaultChecked={d?.active ?? true} className="h-4 w-4" /> Ativo</label>
      <Field label="Descrição" className="md:col-span-2"><textarea name="description" rows={2} defaultValue={d?.description ?? ""} className={textareaCls} /></Field>
      <div className="md:col-span-2"><MediaInput name="imageUrl" label="Imagem (opcional)" defaultValue={d?.imageUrl} folder="downsells" /></div>
      <div className="md:col-span-2"><SubmitButton>{d ? "Salvar" : "Criar downsell"}</SubmitButton></div>
    </ActionForm>
  );
}

export default async function DownsellsPage() {
  const [downs, upsells, products] = await Promise.all([
    db.downsell.findMany({ include: { product: { select: { name: true, active: true, priceCents: true } } }, orderBy: { createdAt: "asc" } }),
    db.upsell.findMany({ select: { id: true, name: true, title: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    db.product.findMany({ select: { id: true, name: true, active: true, priceCents: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  const usedUpsellIds = downs.map((d) => d.upsellId);
  const upsellName = new Map(upsells.map((u) => [u.id, u.name]));
  return (
    <div className="space-y-6">
      <PageHeader title="Downsells" description="Oferta alternativa mais barata, exibida só quando o cliente RECUSA o upsell correspondente. Cada aceite gera um novo PIX; o pedido original não muda." />
      <Card title="Como o downsell funciona">
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
          <li>Um downsell por upsell (relação 1:1).</li>
          <li>Aparece apenas após a recusa do upsell vinculado, se estiver ativo e com material pronto.</li>
          <li>Nunca oferece um produto já comprado ou já incluso no pedido.</li>
          <li>Visualizações, aceites e recusas ficam registrados nas métricas do funil.</li>
        </ul>
      </Card>
      {downs.map((d) => (
        <Card
          key={d.id}
          title={`${d.name} · recusa de "${upsellName.get(d.upsellId) ?? "upsell"}"`}
          actions={
            <span className="flex items-center gap-2">
              {d.active ? <Badge tone="green">ativo</Badge> : <Badge>inativo</Badge>}
              {(!d.product.active || d.product.priceCents <= 0) && <Badge tone="amber">produto indisponível</Badge>}
            </span>
          }
        >
          <DownsellForm d={d} upsells={upsells} products={products} usedUpsellIds={usedUpsellIds} />
          <div className="mt-3 border-t border-slate-100 pt-3"><ConfirmAction action={deleteDownsell} label="Excluir downsell" danger hidden={{ id: d.id }} /></div>
        </Card>
      ))}
      {upsells.length > usedUpsellIds.length ? (
        <Card title="Novo downsell"><DownsellForm d={null} upsells={upsells} products={products} usedUpsellIds={usedUpsellIds} /></Card>
      ) : (
        <Card title="Novo downsell"><p className="text-sm text-slate-600">Todos os upsells já têm um downsell. Crie um upsell novo ou edite um downsell existente.</p></Card>
      )}
    </div>
  );
}
