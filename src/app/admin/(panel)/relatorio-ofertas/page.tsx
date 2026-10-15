import { Card, PageHeader, Badge } from "@/components/admin/ui";
import { PeriodFilter } from "@/components/admin/PeriodFilter";
import { Table } from "@/components/admin/Table";
import { int, pct } from "@/components/admin/format";
import { formatBRL } from "@/utils/format";
import { resolvePeriod } from "@/server/admin/period";
import { bumpReport, downsellReport, upsellReport } from "@/server/admin/reports";

export const metadata = { title: "Bumps, upsells e downsells" };
type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function OffersReportPage({ searchParams }: { searchParams: SP }) {
  const p = resolvePeriod(await searchParams);
  const [bumps, ups, downs] = await Promise.all([bumpReport(p), upsellReport(p), downsellReport(p)]);
  return (
    <div className="space-y-6">
      <PageHeader title="Bumps e upsells" description="Exibições, aceites, recusas e receita incremental" actions={<PeriodFilter current={p.key} from={p.fromInput} to={p.toInput} />} />
      <Card title="Order bumps">
        <Table
          rows={bumps}
          rowKey={(r) => r.id}
          empty="Nenhum order bump cadastrado."
          columns={[
            { key: "n", label: "Bump", render: (r) => <span className="flex items-center gap-2">{r.name}{!r.active && <Badge>inativo</Badge>}</span> },
            { key: "v", label: "Visualizações", align: "right", render: (r) => int(r.views) },
            { key: "a", label: "Marcações", align: "right", render: (r) => int(r.accepts) },
            { key: "x", label: "Desmarcações", align: "right", render: (r) => int(r.rejects) },
            { key: "o", label: "Em pedidos", align: "right", render: (r) => int(r.inOrders) },
            { key: "p", label: "Pagos", align: "right", render: (r) => int(r.paid) },
            { key: "t", label: "Taxa de aceitação", align: "right", render: (r) => pct(r.rate) },
            { key: "r", label: "Receita incremental", align: "right", render: (r) => formatBRL(r.revenue) },
          ]}
        />
        <p className="mt-3 text-xs text-slate-500">Taxa de aceitação = pedidos com o bump ÷ sessões que viram o bump.</p>
      </Card>
      <Card title="Upsells (pós-compra)">
        <Table
          rows={ups}
          rowKey={(r) => r.id}
          empty="Nenhum upsell cadastrado."
          columns={[
            { key: "pos", label: "#", render: (r) => r.position },
            { key: "n", label: "Upsell", render: (r) => <span className="flex items-center gap-2">{r.name}{!r.active && <Badge>inativo</Badge>}</span> },
            { key: "v", label: "Exibidas", align: "right", render: (r) => int(r.views) },
            { key: "a", label: "Aceitas", align: "right", render: (r) => int(r.accepts) },
            { key: "x", label: "Recusadas", align: "right", render: (r) => int(r.rejects) },
            { key: "p", label: "Pagas", align: "right", render: (r) => int(r.paid) },
            { key: "t", label: "Taxa", align: "right", render: (r) => pct(r.rate) },
            { key: "r", label: "Receita incremental", align: "right", render: (r) => formatBRL(r.revenue) },
          ]}
        />
      </Card>
      <Card title="Downsells (recusa do upsell)">
        <Table
          rows={downs}
          rowKey={(r) => r.id}
          empty="Nenhum downsell cadastrado."
          columns={[
            { key: "n", label: "Downsell", render: (r) => <span className="flex items-center gap-2">{r.name}{!r.active && <Badge>inativo</Badge>}</span> },
            { key: "u", label: "Recusa de", render: (r) => r.upsell },
            { key: "v", label: "Exibidas", align: "right", render: (r) => int(r.views) },
            { key: "a", label: "Aceitas", align: "right", render: (r) => int(r.accepts) },
            { key: "x", label: "Recusadas", align: "right", render: (r) => int(r.rejects) },
            { key: "p", label: "Pagas", align: "right", render: (r) => int(r.paid) },
            { key: "t", label: "Taxa", align: "right", render: (r) => pct(r.rate) },
            { key: "r", label: "Receita incremental", align: "right", render: (r) => formatBRL(r.revenue) },
          ]}
        />
      </Card>
    </div>
  );
}
