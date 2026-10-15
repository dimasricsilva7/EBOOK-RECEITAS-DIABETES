import { Badge, Card, Field, PageHeader, inputCls } from "@/components/admin/ui";
import { ActionForm, ConfirmAction, SubmitButton } from "@/components/admin/client";
import { ProductMultiSelect } from "@/components/admin/inputs";
import { db } from "@/lib/db";
import { centsToInput, toLocalInput } from "@/server/admin/forms";
import { formatBRL, formatDate } from "@/utils/format";
import { deleteCoupon, saveCoupon } from "../ofertas-actions";

export const metadata = { title: "Cupons" };
type Coupon = Awaited<ReturnType<typeof db.coupon.findMany>>[number];

function CouponForm({ c, products }: { c: Coupon | null; products: { id: string; name: string; active: boolean }[] }) {
  return (
    <ActionForm action={saveCoupon} resetOnSuccess={!c} className="grid gap-3 md:grid-cols-4">
      {c && <input type="hidden" name="id" value={c.id} />}
      <Field label="Código"><input name="code" required defaultValue={c?.code ?? ""} className={`${inputCls} uppercase`} /></Field>
      <Field label="Tipo">
        <select name="type" defaultValue={c?.type ?? "PERCENT"} className={inputCls}>
          <option value="PERCENT">Percentual (%)</option>
          <option value="FIXED">Valor fixo (R$)</option>
        </select>
      </Field>
      <Field label="Valor" hint="% (1–100) ou R$"><input name="value" required defaultValue={c ? (c.type === "PERCENT" ? c.value : centsToInput(c.value)) : ""} className={inputCls} /></Field>
      <Field label="Pedido mínimo (R$)"><input name="minSubtotal" inputMode="decimal" defaultValue={centsToInput(c?.minSubtotalCents)} className={inputCls} /></Field>
      <Field label="Início"><input type="datetime-local" name="startsAt" defaultValue={toLocalInput(c?.startsAt)} className={inputCls} /></Field>
      <Field label="Fim"><input type="datetime-local" name="endsAt" defaultValue={toLocalInput(c?.endsAt)} className={inputCls} /></Field>
      <Field label="Limite de usos" hint="vazio = ilimitado"><input name="maxUses" inputMode="numeric" defaultValue={c?.maxUses ?? ""} className={inputCls} /></Field>
      <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium"><input type="checkbox" name="active" defaultChecked={c?.active ?? true} className="h-4 w-4" /> Ativo</label>
      <div className="md:col-span-4">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Produtos aplicáveis (nenhum = todos)</p>
        <ProductMultiSelect name="productIds" products={products} defaultValue={Array.isArray(c?.productIds) ? (c!.productIds as string[]) : []} />
      </div>
      <div className="md:col-span-4"><SubmitButton>{c ? "Salvar" : "Criar cupom"}</SubmitButton></div>
    </ActionForm>
  );
}

export default async function CouponsPage() {
  const [coupons, products] = await Promise.all([db.coupon.findMany({ orderBy: { createdAt: "desc" } }), db.product.findMany({ select: { id: true, name: true, active: true }, orderBy: { sortOrder: "asc" } })]);
  return (
    <div className="space-y-6">
      <PageHeader title="Cupons" description="Descontos aplicados no checkout, validados no servidor. O uso é contado quando o pagamento é confirmado." />
      <Card title="Novo cupom"><CouponForm c={null} products={products} /></Card>
      {coupons.map((c) => (
        <Card
          key={c.id}
          title={`${c.code} · ${c.type === "PERCENT" ? `${c.value}%` : formatBRL(c.value)}`}
          actions={
            <span className="flex items-center gap-2 text-xs text-slate-500">
              {c.usedCount}{c.maxUses != null ? `/${c.maxUses}` : ""} usos
              {c.endsAt && ` · até ${formatDate(c.endsAt)}`}
              {c.active ? <Badge tone="green">ativo</Badge> : <Badge>inativo</Badge>}
            </span>
          }
        >
          <CouponForm c={c} products={products} />
          <div className="mt-3 border-t border-slate-100 pt-3"><ConfirmAction action={deleteCoupon} label="Excluir cupom" danger hidden={{ id: c.id }} /></div>
        </Card>
      ))}
    </div>
  );
}
