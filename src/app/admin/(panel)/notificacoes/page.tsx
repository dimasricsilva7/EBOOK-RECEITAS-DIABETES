import { Badge, Card, Field, PageHeader, inputCls } from "@/components/admin/ui";
import { ActionForm, ConfirmAction, SubmitButton } from "@/components/admin/client";
import { db } from "@/lib/db";
import { deletePurchaseNotice, savePurchaseNotice } from "../cms-actions";

export const metadata = { title: "Notificações de compra" };
type Notice = Awaited<ReturnType<typeof db.purchaseNotice.findMany>>[number];

function NoticeForm({ n, products }: { n: Notice | null; products: string[] }) {
  return (
    <ActionForm action={savePurchaseNotice} resetOnSuccess={!n} className="grid gap-3 md:grid-cols-2">
      {n && <input type="hidden" name="id" value={n.id} />}
      <Field label="Nome do cliente"><input name="name" required defaultValue={n?.name ?? ""} placeholder="Ex.: João P." className={inputCls} /></Field>
      <Field label="Produto comprado">
        <input name="product" required defaultValue={n?.product ?? ""} list="produtos-list" placeholder="Ex.: Kit Completo" className={inputCls} />
        <datalist id="produtos-list">{products.map((p) => <option key={p} value={p} />)}</datalist>
      </Field>
      <Field label="Tempo exibido" hint='ex.: "há 2 horas" · vazio = "há pouco"'><input name="timeLabel" defaultValue={n?.timeLabel ?? ""} className={inputCls} /></Field>
      <Field label="Ordem"><input name="sortOrder" type="number" defaultValue={n?.sortOrder ?? 0} className={inputCls} /></Field>
      <div className="space-y-2 md:col-span-2">
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="active" defaultChecked={n?.active ?? true} className="h-4 w-4" /> Exibir no site</label>
        <label className="flex items-start gap-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">
          <input type="checkbox" name="confirmReal" defaultChecked={n?.active ?? false} className="mt-0.5 h-4 w-4" />
          Confirmo que esta é uma compra REAL. Notificações de compra falsas violam as políticas da Meta (podem derrubar sua conta) e o Código de Defesa do Consumidor.
        </label>
      </div>
      <div className="md:col-span-2"><SubmitButton>{n ? "Salvar" : "Adicionar"}</SubmitButton></div>
    </ActionForm>
  );
}

export default async function NoticesPage() {
  const [notices, prods] = await Promise.all([
    db.purchaseNotice.findMany({ orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { createdAt: "desc" }] }),
    db.product.findMany({ where: { active: true }, select: { name: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  const products = prods.map((p) => p.name);
  return (
    <div className="space-y-6">
      <PageHeader title="Notificações de compra" description="Balões de prova social no site (checkout e landing), a cada ~10s. As compras REAIS pagas aparecem automaticamente; aqui você adiciona outras compras reais (ex.: vendas pelo WhatsApp). Nunca cadastre compras falsas." />
      <Card title="Nova notificação"><NoticeForm n={null} products={products} /></Card>
      {notices.map((n) => (
        <Card key={n.id} title={`${n.name} — ${n.product}`} actions={n.active ? <Badge tone="green">exibindo</Badge> : <Badge>oculta</Badge>}>
          <NoticeForm n={n} products={products} />
          <div className="mt-3 border-t border-slate-100 pt-3"><ConfirmAction action={deletePurchaseNotice} label="Remover" danger hidden={{ id: n.id }} /></div>
        </Card>
      ))}
    </div>
  );
}
