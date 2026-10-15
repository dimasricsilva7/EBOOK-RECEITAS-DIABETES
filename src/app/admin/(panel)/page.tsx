import Link from "next/link";
import { Card, PageHeader, Stat } from "@/components/admin/ui";
import { PeriodFilter } from "@/components/admin/PeriodFilter";
import { OnlineNow } from "@/components/admin/OnlineNow";
import { DayBars, HBars } from "@/components/admin/charts";
import { int, pct, ratioLabel } from "@/components/admin/format";
import { bravopayMode, envHealth } from "@/lib/env";
import { formatBRL } from "@/utils/format";
import { resolvePeriod } from "@/server/admin/period";
import { dashboard, funnel } from "@/server/admin/reports";

export const metadata = { title: "Dashboard" };

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function DashboardPage({ searchParams }: { searchParams: SP }) {
  const p = resolvePeriod(await searchParams);
  const [d, f] = await Promise.all([dashboard(p), funnel(p)]);
  const missing = envHealth().filter((e) => e.required && !e.ok);
  const mode = bravopayMode();

  return (
    <div>
      <PageHeader title="Dashboard" description={`${p.label} · visão de negócio`} actions={<PeriodFilter current={p.key} from={p.fromInput} to={p.toInput} />} />

      {(missing.length > 0 || mode !== "live") && (
        <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">
            {mode === "mock" ? "Modo de teste da BravoPay ativo (PIX fictício)." : mode === "disabled" ? "Pagamentos desativados: configure a BravoPay." : "Configuração pendente."}
          </p>
          {missing.length > 0 && <p className="mt-1">Variáveis ausentes: {missing.map((m) => m.key).join(", ")}.</p>}
          <Link href="/admin/configuracoes" className="mt-1 inline-block font-semibold underline">Ver diagnóstico</Link>
        </div>
      )}

      <OnlineNow />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat label="Receita" value={formatBRL(d.revenue)} hint={`${d.paidOrders} pedido(s) pago(s)`} />
        <Stat label="Pedidos" value={int(d.orders)} hint={`${d.pixGenerated} PIX gerado(s)`} />
        <Stat label="Ticket médio" value={formatBRL(Math.round(d.aov))} />
        <Stat label="Conversão" value={pct(d.conversion, 2)} hint={`${int(d.visitors)} visitantes`} />
        <Stat label="Receita / visitante" value={formatBRL(Math.round(d.revenuePerVisitor))} />
        <Stat label="PIX pagos" value={`${d.pixPaid} / ${d.pixGenerated}`} hint={`Taxa de pagamento ${pct(d.pixPaymentRate)}`} />
        <Stat label="PIX pendentes" value={int(d.pendingPix)} hint="aguardando pagamento agora" />
        <Stat label="Checkout abandonado" value={pct(d.checkoutAbandonment)} hint="iniciaram e não geraram PIX" />
        <Stat label="Order bump" value={pct(d.bumpRate)} hint={`dos pedidos · ${pct(d.bumpViewRate)} de quem viu`} />
        <Stat label="Upsell" value={pct(d.upsellRate)} hint="aceites / exibições" />
        <Stat label="Investimento" value={formatBRL(d.spendCents)} hint={d.spendCents ? undefined : "cadastre em Custos"} />
        <Stat label="ROAS" value={d.spendCents ? ratioLabel(d.roas) : "—"} />
        <Stat label="CPA" value={d.spendCents && d.paidOrders ? formatBRL(Math.round(d.cpa)) : "—"} />
        <Stat label="CAC" value={d.spendCents && d.cac ? formatBRL(Math.round(d.cac)) : "—"} hint="por novo cliente" />
        <Stat label="Sessões" value={int(d.sessions)} />
      </section>

      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">Quiz, oferta e checkout</h2>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat label="Inícios de quiz" value={int(d.quiz.started)} hint="com consentimento" />
        <Stat label="Quiz concluídos" value={int(d.quiz.completed)} hint={`${pct(d.quiz.completionRate)} de conclusão`} />
        <Stat label="Leads identificados" value={int(d.quiz.leads)} hint="nome + e-mail no quiz" />
        <Stat label="Visualizações da oferta" value={int(d.offerViews)} hint="sessões que viram a oferta" />
        <Stat label="Checkouts iniciados" value={int(d.checkoutsStarted)} />
        <Stat label="Conversão da landing" value={pct(d.landingConversion, 2)} hint="compras ÷ sessões na landing" />
        <Stat label="Conversão do checkout" value={pct(d.checkoutConversion, 2)} hint="compras ÷ checkouts iniciados" />
        <Stat label="Pagamentos aprovados" value={int(d.paidOrders)} hint={`${d.crediarioPaid} no crediário`} />
        <Stat label="Receita adicional" value={formatBRL(d.extraRevenue)} hint={`bump ${formatBRL(d.bumpRevenue)} · upsell ${formatBRL(d.upsellRevenue)}`} />
        <Stat label="Leads que compraram" value={int(d.quiz.purchased)} hint={`${pct(d.quiz.leads ? d.quiz.purchased / d.quiz.leads : 0)} dos leads`} />
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card title="Receita por dia">
          <DayBars data={d.daily} series={["Receita"]} format="brlShort" />
        </Card>
        <Card title="Funil do período" actions={<Link href={`/admin/funil?periodo=${p.key}&de=${p.fromInput}&ate=${p.toInput}`} className="text-xs font-semibold text-slate-600 hover:underline">Detalhar →</Link>}>
          <HBars rows={f.steps.map((s) => ({ label: s.label, value: s.value, sub: s.pctOfFirst ? pct(s.pctOfFirst) : undefined }))} />
        </Card>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <Card title="Vendas por produto">
          <HBars rows={d.byKit} format="brl" />
        </Card>
        <Card title="Vendas por origem">
          <HBars rows={d.byChannel} format="brl" />
        </Card>
        <Card title="Vendas por campanha">
          <HBars rows={d.byCampaign} format="brl" />
        </Card>
        <Card title="Vendas por dispositivo">
          <HBars rows={d.byDevice} format="brl" />
        </Card>
      </div>
    </div>
  );
}
