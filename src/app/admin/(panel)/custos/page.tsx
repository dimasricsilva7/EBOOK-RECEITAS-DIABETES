import { Card, PageHeader, Field, inputCls, textareaCls, btnDanger } from "@/components/admin/ui";
import { ActionForm, SubmitButton } from "@/components/admin/client";
import { Table } from "@/components/admin/Table";
import { PeriodFilter } from "@/components/admin/PeriodFilter";
import { db } from "@/lib/db";
import { formatBRL, formatDate } from "@/utils/format";
import { addSpend, deleteSpend, importSpend } from "./actions";
import { resolvePeriod } from "@/server/admin/period";

export const metadata = { title: "Custos de anúncios" };
type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function SpendPage({ searchParams }: { searchParams: SP }) {
  const p = resolvePeriod(await searchParams);
  const rows = await db.adSpend.findMany({ where: { date: { gte: new Date(p.fromInput), lte: new Date(p.toInput) } }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 500 });
  const total = rows.reduce((s, r) => s + r.spendCents, 0);
  return (
    <div className="space-y-6">
      <PageHeader title="Custos de anúncios" description={`Base para CPA, CAC e ROAS · ${formatBRL(total)} no período`} actions={<PeriodFilter current={p.key} from={p.fromInput} to={p.toInput} />} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Adicionar custo">
          <ActionForm action={addSpend} resetOnSuccess className="grid gap-3 sm:grid-cols-2">
            <Field label="Data"><input type="date" name="date" required className={inputCls} /></Field>
            <Field label="Origem (= utm_source)"><input name="source" required placeholder="facebook" className={inputCls} /></Field>
            <Field label="Campanha (= utm_campaign)"><input name="campaign" className={inputCls} /></Field>
            <Field label="Conjunto"><input name="adset" className={inputCls} /></Field>
            <Field label="Anúncio"><input name="ad" className={inputCls} /></Field>
            <Field label="Investimento (R$)"><input name="spend" required inputMode="decimal" placeholder="150,00" className={inputCls} /></Field>
            <div className="sm:col-span-2"><SubmitButton>Adicionar</SubmitButton></div>
          </ActionForm>
        </Card>
        <Card title="Importar em lote">
          <ActionForm action={importSpend} resetOnSuccess>
            <Field label="Uma linha por registro" hint="data;origem;campanha;conjunto;anúncio;valor — ex.: 28/09/2026;facebook;test;publico-1;creative01;150,00">
              <textarea name="csv" rows={6} className={textareaCls} />
            </Field>
            <SubmitButton>Importar</SubmitButton>
          </ActionForm>
        </Card>
      </div>
      <Table
        rows={rows}
        rowKey={(r) => r.id}
        empty="Nenhum custo cadastrado no período."
        columns={[
          { key: "d", label: "Data", render: (r) => formatDate(new Date(r.date.getTime() + 3 * 3600_000)) },
          { key: "s", label: "Origem", render: (r) => r.source },
          { key: "c", label: "Campanha", render: (r) => r.campaign ?? "—" },
          { key: "a", label: "Conjunto", render: (r) => r.adset ?? "—" },
          { key: "ad", label: "Anúncio", render: (r) => r.ad ?? "—" },
          { key: "v", label: "Investimento", align: "right", render: (r) => formatBRL(r.spendCents) },
          { key: "x", label: "", render: (r) => <form action={deleteSpend}><input type="hidden" name="id" value={r.id} /><button className={`${btnDanger} h-8 px-2 text-xs`}>Excluir</button></form> },
        ]}
      />
    </div>
  );
}
