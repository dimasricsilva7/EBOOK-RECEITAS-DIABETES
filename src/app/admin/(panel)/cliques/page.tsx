import { PageHeader } from "@/components/admin/ui";
import { PeriodFilter } from "@/components/admin/PeriodFilter";
import { Table } from "@/components/admin/Table";
import { int, pct } from "@/components/admin/format";
import { resolvePeriod } from "@/server/admin/period";
import { clicks } from "@/server/admin/reports";

export const metadata = { title: "Cliques" };
type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function ClicksPage({ searchParams }: { searchParams: SP }) {
  const p = resolvePeriod(await searchParams);
  const rows = await clicks(p);
  return (
    <div>
      <PageHeader title="Cliques por elemento" description="CTAs da landing, quiz, order bump, checkout e área de acesso" actions={<PeriodFilter current={p.key} from={p.fromInput} to={p.toInput} />} />
      <Table
        rows={rows}
        rowKey={(r) => r.element}
        columns={[
          { key: "l", label: "Elemento", render: (r) => <span><b className="font-medium">{r.label}</b><span className="ml-2 text-xs text-slate-400">{r.element}</span></span> },
          { key: "c", label: "Cliques", align: "right", render: (r) => int(r.clicks) },
          { key: "u", label: "Usuários únicos", align: "right", render: (r) => int(r.users) },
          { key: "cv", label: "Conversões", align: "right", render: (r) => int(r.conversions) },
          { key: "t", label: "Taxa de conversão", align: "right", render: (r) => pct(r.rate) },
        ]}
      />
      <p className="mt-3 text-xs text-slate-500">Conversão = sessões que clicaram e compraram (pagamento confirmado).</p>
    </div>
  );
}
