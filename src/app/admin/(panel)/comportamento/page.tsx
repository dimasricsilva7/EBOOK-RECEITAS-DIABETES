import { Card, PageHeader, Stat } from "@/components/admin/ui";
import { PeriodFilter } from "@/components/admin/PeriodFilter";
import { int, pct } from "@/components/admin/format";
import { resolvePeriod } from "@/server/admin/period";
import { behavior } from "@/server/admin/reports";

export const metadata = { title: "Comportamento" };
type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function BehaviorPage({ searchParams }: { searchParams: SP }) {
  const p = resolvePeriod(await searchParams);
  const b = await behavior(p);
  const maxDepth = Math.max(1, b.depth[0]?.value ?? 1);

  return (
    <div>
      <PageHeader title="Comportamento na página" description="Até onde as pessoas rolam a página inicial e onde saem do site (eventos próprios)" actions={<PeriodFilter current={p.key} from={p.fromInput} to={p.toInput} />} />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Abriram a página inicial" value={int(b.landing)} hint={p.label} />
        <Stat label="Rolaram até os kits (25%)" value={pct(b.depth[1]?.pct ?? 0)} hint={`${int(b.depth[1]?.value ?? 0)} sessões`} />
        <Stat label="Chegaram ao fim (90%)" value={pct(b.depth[4]?.pct ?? 0)} hint={`${int(b.depth[4]?.value ?? 0)} sessões`} />
        <Stat label="Abriram o checkout" value={pct(b.depth[7]?.pct ?? 0)} hint={`${int(b.depth[7]?.value ?? 0)} sessões`} />
      </div>

      <Card title={`Até onde as pessoas rolam · ${p.label}`}>
        <ol className="space-y-3">
          {b.depth.map((d, i) => (
            <li key={d.label}>
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="font-semibold text-slate-800">{d.label}</span>
                <span className="tabular-nums text-slate-600">
                  <b className="text-slate-900">{int(d.value)}</b> · {pct(d.pct)}
                  {i >= 1 && i <= 4 && b.depth[i - 1].value > 0 && <span className={d.value / b.depth[i - 1].value < 0.5 ? " text-red-600" : " text-slate-400"}> · {pct(Math.max(0, 1 - d.value / b.depth[i - 1].value))} saíram aqui</span>}
                </span>
              </div>
              <div className="mt-1 h-3 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-[#2a78d6]" style={{ width: `${(d.value / maxDepth) * 100}%` }} />
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-xs text-slate-500">Cada linha conta sessões distintas. A maior queda mostra onde a página inicial está perdendo gente — é ali que vale mexer no texto, na imagem ou no botão.</p>
      </Card>

      <div className="mt-6">
        <Card title={`Onde os visitantes saem do site · ${p.label}`}>
          <ul className="space-y-2">
            {b.exits.map((e) => (
              <li key={e.page}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium text-slate-800">{e.page}</span>
                  <span className="tabular-nums text-slate-600"><b className="text-slate-900">{int(e.sessions)}</b> · {pct(e.pct)}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-slate-400" style={{ width: `${e.pct * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-slate-500">Última página de cada sessão. Muita gente saindo no checkout = atrito no checkout; muita gente saindo na página inicial = o anúncio ou o topo não convencem.</p>
        </Card>
      </div>
    </div>
  );
}
