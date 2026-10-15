import { Card, PageHeader } from "@/components/admin/ui";
import { PeriodFilter } from "@/components/admin/PeriodFilter";
import { Table } from "@/components/admin/Table";
import { HBars } from "@/components/admin/charts";
import { int, pct } from "@/components/admin/format";
import { CATEGORY_LABEL } from "@/lib/domain";
import { formatBRL, formatDate } from "@/utils/format";
import { resolvePeriod } from "@/server/admin/period";
import { priceAnalysis, productStats } from "@/server/admin/reports";

export const metadata = { title: "Produtos e preço" };
type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function ProductReportPage({ searchParams }: { searchParams: SP }) {
  const p = resolvePeriod(await searchParams);
  const [stats, price] = await Promise.all([productStats(p), priceAnalysis(p)]);
  const sold = stats.filter((s) => s.units > 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Produtos e preço" description="Desempenho por produto, ranking interno e conversão por preço" actions={<PeriodFilter current={p.key} from={p.fromInput} to={p.toInput} />} />

      <Table
        rows={stats}
        rowKey={(r) => r.id}
        columns={[
          { key: "n", label: "Produto", render: (r) => <span><b className="font-medium">{r.name}</b> <span className="text-xs text-slate-400">{CATEGORY_LABEL[r.category]}</span></span> },
          { key: "v", label: "Visualizações", align: "right", render: (r) => int(r.views) },
          { key: "c", label: "Cliques", align: "right", render: (r) => int(r.clicks) },
          { key: "a", label: "Add to cart", align: "right", render: (r) => int(r.carts) },
          { key: "k", label: "Checkout", align: "right", render: (r) => int(r.checkouts) },
          { key: "p", label: "Compras", align: "right", render: (r) => int(r.purchases) },
          { key: "cv", label: "Conversão", align: "right", render: (r) => pct(r.conversion) },
          { key: "r", label: "Receita", align: "right", render: (r) => formatBRL(r.revenue) },
        ]}
      />

      <p className="text-xs text-slate-500">Ranking de uso interno — não é exibido na loja nem usado como argumento de marketing.</p>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Top por unidades"><HBars rows={[...sold].sort((a, b) => b.units - a.units).map((s) => ({ label: s.name, value: s.units }))} format="units" /></Card>
        <Card title="Top por receita"><HBars rows={[...sold].sort((a, b) => b.revenue - a.revenue).map((s) => ({ label: s.name, value: s.revenue }))} format="brl" /></Card>
        <Card title="Top por conversão (%)"><HBars rows={[...stats].filter((s) => s.views > 0).sort((a, b) => b.conversion - a.conversion).map((s) => ({ label: s.name, value: Math.round(s.conversion * 1000) / 10, sub: `${s.purchases}/${s.views}` }))} /></Card>
      </div>

      <Card title="Conversão por preço (janelas de preço dos kits)">
        <Table
          rows={price.windows}
          rowKey={(r, i) => `${r.product}-${i}`}
          empty="Sem dados de preço no período."
          columns={[
            { key: "p", label: "Produto", render: (r) => r.product },
            { key: "pr", label: "Preço", align: "right", render: (r) => <b>{formatBRL(r.priceCents)}</b> },
            { key: "w", label: "Vigência no período", render: (r) => `${formatDate(r.from)} → ${r.current ? "hoje" : formatDate(r.to)}` },
            { key: "v", label: "Sessões que viram", align: "right", render: (r) => int(r.viewSessions) },
            { key: "o", label: "Pedidos pagos", align: "right", render: (r) => int(r.orders) },
            { key: "c", label: "Conversão", align: "right", render: (r) => pct(r.conversion) },
            { key: "r", label: "Receita", align: "right", render: (r) => formatBRL(r.revenue) },
          ]}
        />
        <p className="mt-3 text-xs text-slate-500">As janelas vêm do histórico de alterações de preço. A receita usa o preço gravado em cada pedido (nunca o preço atual).</p>
      </Card>

      <Card title="Vendas por preço aplicado (inclui promoções e testes A/B)">
        <Table
          rows={price.applied}
          rowKey={(r) => `${r.product}-${r.priceCents}`}
          empty="Nenhuma venda paga no período."
          columns={[
            { key: "p", label: "Produto", render: (r) => r.product },
            { key: "pr", label: "Preço unitário", align: "right", render: (r) => formatBRL(r.priceCents) },
            { key: "o", label: "Pedidos", align: "right", render: (r) => int(r.orders) },
            { key: "u", label: "Unidades", align: "right", render: (r) => int(r.units) },
            { key: "r", label: "Receita", align: "right", render: (r) => formatBRL(r.revenue) },
          ]}
        />
      </Card>
    </div>
  );
}
