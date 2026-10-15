import Link from "next/link";
import { PageHeader } from "@/components/admin/ui";
import { PeriodFilter } from "@/components/admin/PeriodFilter";
import { Table } from "@/components/admin/Table";
import { int, pct, ratioLabel } from "@/components/admin/format";
import { formatBRL } from "@/utils/format";
import { resolvePeriod } from "@/server/admin/period";
import { ACQ_DIMS, acquisition, type AcqDim } from "@/server/admin/reports";

export const metadata = { title: "Aquisição" };
type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function AcquisitionPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const p = resolvePeriod(sp);
  const dim = (typeof sp.por === "string" && sp.por in ACQ_DIMS ? sp.por : "utmSource") as AcqDim;
  const rows = await acquisition(p, dim);
  const qs = (d: string) => new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => typeof v === "string")) as Record<string, string>, por: d }).toString();

  return (
    <div>
      <PageHeader title="Aquisição" description="Sessões, pedidos e retorno por origem de tráfego" actions={<PeriodFilter current={p.key} from={p.fromInput} to={p.toInput} />} />
      <nav className="mb-4 flex flex-wrap gap-1.5" aria-label="Agrupar por">
        {Object.entries(ACQ_DIMS).map(([k, label]) => (
          <Link key={k} href={`?${qs(k)}`} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${k === dim ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-700"}`}>
            {label}
          </Link>
        ))}
      </nav>
      <Table
        rows={rows}
        rowKey={(r) => r.key}
        columns={[
          { key: "k", label: ACQ_DIMS[dim], render: (r) => <span className="font-medium">{r.key}</span> },
          { key: "s", label: "Sessões", align: "right", render: (r) => int(r.sessions) },
          { key: "v", label: "Visitantes", align: "right", render: (r) => int(r.visitors) },
          { key: "o", label: "Pedidos", align: "right", render: (r) => int(r.orders) },
          { key: "p", label: "Pagos", align: "right", render: (r) => int(r.paid) },
          { key: "r", label: "Receita", align: "right", render: (r) => formatBRL(r.revenue) },
          { key: "c", label: "Conversão", align: "right", render: (r) => pct(r.conversion, 2) },
          { key: "t", label: "Ticket médio", align: "right", render: (r) => (r.paid ? formatBRL(Math.round(r.aov)) : "—") },
          { key: "sp", label: "Investimento", align: "right", render: (r) => (r.spendCents ? formatBRL(r.spendCents) : "—") },
          { key: "cpa", label: "CPA", align: "right", render: (r) => (r.cpa ? formatBRL(Math.round(r.cpa)) : "—") },
          { key: "roas", label: "ROAS", align: "right", render: (r) => ratioLabel(r.roas) },
        ]}
      />
      <p className="mt-3 text-xs text-slate-500">
        Pedidos usam a atribuição last-touch salva no pedido. Investimento, CPA e ROAS aparecem ao agrupar por UTM Source, Canal ou UTM Campaign e dependem dos custos cadastrados em <Link href="/admin/custos" className="underline">Custos de anúncios</Link> (a origem/campanha do custo deve ser igual à UTM).
      </p>
    </div>
  );
}
