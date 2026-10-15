import { Badge, Card, Field, PageHeader, inputCls, textareaCls } from "@/components/admin/ui";
import { ActionForm, ConfirmAction, SubmitButton } from "@/components/admin/client";
import { MediaInput, ProductMultiSelect } from "@/components/admin/inputs";
import { db } from "@/lib/db";
import { centsToInput } from "@/server/admin/forms";
import { formatBRL } from "@/utils/format";
import { deleteUpsell, saveUpsell } from "../ofertas-actions";

export const metadata = { title: "Upsells" };

type Up = Awaited<ReturnType<typeof db.upsell.findMany>>[number];
type Prod = { id: string; name: string; active: boolean; priceCents: number };

function UpsellForm({ u, products }: { u: Up | null; products: Prod[] }) {
  const triggers = Array.isArray(u?.triggerProductIds) ? (u!.triggerProductIds as string[]) : [];
  return (
    <ActionForm action={saveUpsell} resetOnSuccess={!u} className="grid gap-3 md:grid-cols-2">
      {u && <input type="hidden" name="id" value={u.id} />}
      <Field label="Nome interno"><input name="name" defaultValue={u?.name ?? ""} className={inputCls} /></Field>
      <Field label="Produto">
        <select name="productId" defaultValue={u?.productId ?? ""} required className={inputCls}>
          <option value="">Selecione…</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}{p.priceCents ? ` · ${formatBRL(p.priceCents)}` : " · sem preço"}{p.active ? "" : " (inativo)"}</option>)}
        </select>
      </Field>
      <Field label="Chamada"><input name="headline" required defaultValue={u?.headline ?? ""} placeholder="Para aprofundar o que você começou…" className={inputCls} /></Field>
      <Field label="Título"><input name="title" required defaultValue={u?.title ?? ""} className={inputCls} /></Field>
      <Field label="Descrição" className="md:col-span-2"><textarea name="description" rows={2} defaultValue={u?.description ?? ""} className={textareaCls} /></Field>
      <Field label="Preço especial (R$)" hint="vazio = preço atual do produto · mínimo R$ 5,00 (PIX)"><input name="price" inputMode="decimal" defaultValue={centsToInput(u?.priceCents)} className={inputCls} /></Field>
      <Field label="Posição na sequência"><input name="sortOrder" type="number" defaultValue={u?.sortOrder ?? 0} className={inputCls} /></Field>
      <div className="md:col-span-2"><MediaInput name="imageUrl" label="Imagem (opcional)" defaultValue={u?.imageUrl} folder="upsells" /></div>
      <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="active" defaultChecked={u?.active ?? true} className="h-4 w-4" /> Ativo</label>
      <div className="md:col-span-2">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Regra: oferecer somente se o pedido contiver…</p>
        <ProductMultiSelect name="triggerProductIds" products={products} defaultValue={triggers} />
      </div>
      <div className="md:col-span-2"><SubmitButton>{u ? "Salvar" : "Criar upsell"}</SubmitButton></div>
    </ActionForm>
  );
}

export default async function UpsellsPage() {
  const [ups, products] = await Promise.all([
    db.upsell.findMany({ include: { product: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    db.product.findMany({ select: { id: true, name: true, active: true, priceCents: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title="Upsells pós-compra" description="Sequência exibida após o pagamento confirmado: Upsell 1 → 2 → 3. Cada aceite gera um novo PIX; o pedido original não muda." />
      <Card title="Como a sequência funciona">
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
          <li>Mostra o próximo upsell ativo (pela posição) que o cliente ainda não aceitou nem recusou.</li>
          <li>Nunca oferece um produto já comprado, já incluso no plano, ou fora da regra configurada.</li>
          <li>Produtos inativos ou sem preço são pulados automaticamente.</li>
          <li>Exibições, aceites e recusas ficam registrados em Relatórios → Bumps e upsells.</li>
        </ul>
      </Card>
      {ups.map((u) => (
        <Card
          key={u.id}
          title={`Upsell ${u.sortOrder} · ${u.name}`}
          actions={
            <span className="flex items-center gap-2">
              {u.active ? <Badge tone="green">ativo</Badge> : <Badge>inativo</Badge>}
              {(!u.product.active || u.product.priceCents <= 0) && <Badge tone="amber">produto indisponível — é pulado</Badge>}
            </span>
          }
        >
          <UpsellForm u={u} products={products} />
          <div className="mt-3 border-t border-slate-100 pt-3"><ConfirmAction action={deleteUpsell} label="Excluir upsell" danger hidden={{ id: u.id }} /></div>
        </Card>
      ))}
      <Card title="Novo upsell"><UpsellForm u={null} products={products} /></Card>
    </div>
  );
}
