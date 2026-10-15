import { Badge, Card, Field, PageHeader, inputCls } from "@/components/admin/ui";
import { ActionForm, ConfirmAction, SubmitButton } from "@/components/admin/client";
import { VariantsEditor } from "@/components/admin/inputs";
import { Table } from "@/components/admin/Table";
import { int, pct } from "@/components/admin/format";
import { db } from "@/lib/db";
import { formatBRL } from "@/utils/format";
import { deleteExperiment, saveExperiment } from "../ofertas-actions";

export const metadata = { title: "Testes A/B" };

const TARGETS: Record<string, string> = {
  hero_headline: "Headline do hero (valor = texto)",
  hero_cta: "Texto do CTA do hero (valor = texto)",
  hero_image: "Imagem do hero (valor = URL)",
  featured_kit: "Plano destacado (valor = ID do produto)",
  section_order: "Ordem das seções (valor = chaves separadas por vírgula)",
  order_bump: "Order bump exibido (valor = ID do bump)",
};

async function results(key: string) {
  const rows = await db.$queryRaw<{ variant: string; sessions: bigint; checkouts: bigint; purchases: bigint; revenue: bigint }[]>`
    SELECT s.experiments->>${key} variant, COUNT(DISTINCT s.id) sessions,
           COUNT(DISTINCT e."sessionId") FILTER (WHERE e.name = 'checkout_started') checkouts,
           COUNT(DISTINCT e."sessionId") FILTER (WHERE e.name = 'purchase') purchases,
           COALESCE(SUM(e."valueCents") FILTER (WHERE e.name = 'purchase'), 0) revenue
    FROM "AnalyticsSession" s LEFT JOIN "AnalyticsEvent" e ON e."sessionId" = s.id
    WHERE s.experiments ? ${key}
    GROUP BY 1 ORDER BY 1`;
  return rows.map((r) => ({ variant: r.variant, sessions: Number(r.sessions), checkouts: Number(r.checkouts), purchases: Number(r.purchases), revenue: Number(r.revenue) }));
}

type Exp = Awaited<ReturnType<typeof db.experiment.findMany>>[number];

function ExperimentForm({ e, targets }: { e: Exp | null; targets: Record<string, string> }) {
  return (
    <ActionForm action={saveExperiment} resetOnSuccess={!e} className="grid gap-3 md:grid-cols-3">
      {e && <input type="hidden" name="id" value={e.id} />}
      <Field label="Chave (única)"><input name="key" required defaultValue={e?.key ?? ""} className={inputCls} /></Field>
      <Field label="Nome"><input name="name" defaultValue={e?.name ?? ""} className={inputCls} /></Field>
      <Field label="O que testar">
        <select name="target" defaultValue={e?.target ?? "hero_headline"} className={inputCls}>
          {Object.entries(targets).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Field>
      <div className="md:col-span-3">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Variantes (peso = % do tráfego; valor vazio = versão original)</p>
        <VariantsEditor name="variants" defaultValue={Array.isArray(e?.variants) ? (e!.variants as Record<string, unknown>[]) : [{ key: "a", label: "Controle", weight: 50, value: "" }, { key: "b", label: "Variante", weight: 50, value: "" }]} />
      </div>
      <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="active" defaultChecked={e?.active ?? false} className="h-4 w-4" /> Ativo</label>
      <div className="md:col-span-3"><SubmitButton>{e ? "Salvar" : "Criar teste"}</SubmitButton></div>
    </ActionForm>
  );
}

export default async function ExperimentsPage() {
  const [experiments, products] = await Promise.all([db.experiment.findMany({ orderBy: { createdAt: "desc" } }), db.product.findMany({ where: { active: true }, select: { id: true, name: true } })]);
  const targets = { ...TARGETS, ...Object.fromEntries(products.map((p) => [`price:${p.id}`, `Preço — ${p.name} (valor = centavos)`])) };
  const res = await Promise.all(experiments.map((e) => results(e.key)));
  return (
    <div className="space-y-6">
      <PageHeader title="Testes A/B" description="Cada visitante recebe sempre a mesma variante. A variante fica registrada na sessão, nos eventos e no pedido." />
      {experiments.map((e, i) => (
        <Card key={e.id} title={`${e.name} · ${targets[e.target] ?? e.target}`} actions={e.active ? <Badge tone="green">ativo</Badge> : <Badge>pausado</Badge>}>
          <Table
            rows={res[i]}
            rowKey={(r) => r.variant}
            empty="Ainda sem sessões neste teste."
            columns={[
              { key: "v", label: "Variante", render: (r) => r.variant },
              { key: "s", label: "Sessões", align: "right", render: (r) => int(r.sessions) },
              { key: "c", label: "Checkout", align: "right", render: (r) => int(r.checkouts) },
              { key: "p", label: "Compras", align: "right", render: (r) => int(r.purchases) },
              { key: "cv", label: "Conversão", align: "right", render: (r) => pct(r.sessions ? r.purchases / r.sessions : 0, 2) },
              { key: "r", label: "Receita", align: "right", render: (r) => formatBRL(r.revenue) },
              { key: "rpv", label: "Receita/visitante", align: "right", render: (r) => formatBRL(r.sessions ? Math.round(r.revenue / r.sessions) : 0) },
            ]}
          />
          <div className="mt-4 border-t border-slate-100 pt-4"><ExperimentForm e={e} targets={targets} /></div>
          <div className="mt-3"><ConfirmAction action={deleteExperiment} label="Excluir teste" danger hidden={{ id: e.id }} /></div>
        </Card>
      ))}
      <Card title="Novo teste"><ExperimentForm e={null} targets={targets} /></Card>
    </div>
  );
}
