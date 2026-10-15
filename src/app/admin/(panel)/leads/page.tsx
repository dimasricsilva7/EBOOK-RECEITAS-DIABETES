import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Badge, EmptyState, PageHeader, Pagination, Stat, inputCls, btnSecondary } from "@/components/admin/ui";
import { Table } from "@/components/admin/Table";
import { PeriodFilter } from "@/components/admin/PeriodFilter";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/utils/format";
import { resolvePeriod } from "@/server/admin/period";
import { getPublishedQuiz } from "@/server/quiz";

export const metadata = { title: "Leads e Quiz" };
type SP = Promise<Record<string, string | string[] | undefined>>;
const PER_PAGE = 40;

const STAGES = {
  started: "Iniciou o quiz",
  completed: "Concluiu o quiz",
  identified: "Lead identificado",
  offer: "Viu a oferta",
  checkout: "Iniciou checkout",
  purchased: "Comprou",
  anonymous: "Anônimas (sem nome/e-mail)",
} as const;

/**
 * Sessões do quiz (anônimas e identificadas). Acesso: ADMIN/OWNER — as respostas podem revelar
 * informações sensíveis. Nada daqui é enviado a plataformas de anúncio.
 */
export default async function LeadsPage({ searchParams }: { searchParams: SP }) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  if (admin.role === "EDITOR") return <EmptyState title="Acesso restrito" text="Leads e respostas do quiz são visíveis apenas para administradores (papel ADMIN ou OWNER)." />;
  const p = resolvePeriod(sp);
  const stage = typeof sp.etapa === "string" ? sp.etapa : "";
  const source = typeof sp.origem === "string" ? sp.origem.slice(0, 60) : "";
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const page = Math.max(1, Number.parseInt(String(sp.page ?? "1"), 10) || 1);

  const where: Prisma.QuizSessionWhereInput = {
    startedAt: { gte: p.from, lt: p.to },
    ...(stage === "completed" ? { completedAt: { not: null } } : {}),
    ...(stage === "identified" ? { identifiedAt: { not: null } } : {}),
    ...(stage === "offer" ? { offerViewedAt: { not: null } } : {}),
    ...(stage === "checkout" ? { checkoutStartedAt: { not: null } } : {}),
    ...(stage === "purchased" ? { purchasedAt: { not: null } } : {}),
    ...(stage === "anonymous" ? { email: null } : {}),
    ...(source ? { OR: [{ utmSource: source }, { channel: source }] } : {}),
    ...(q ? { OR: [{ email: { contains: q.toLowerCase() } }, { name: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const base: Prisma.QuizSessionWhereInput = { startedAt: { gte: p.from, lt: p.to } };
  const [rows, total, counts, sources, quiz] = await Promise.all([
    db.quizSession.findMany({ where, orderBy: { lastInteractionAt: "desc" }, skip: (page - 1) * PER_PAGE, take: PER_PAGE, include: { order: { select: { id: true, orderNumber: true, status: true } } } }),
    db.quizSession.count({ where }),
    Promise.all([
      db.quizSession.count({ where: base }),
      db.quizSession.count({ where: { ...base, completedAt: { not: null } } }),
      db.quizSession.count({ where: { ...base, identifiedAt: { not: null } } }),
      db.quizSession.count({ where: { ...base, offerViewedAt: { not: null } } }),
      db.quizSession.count({ where: { ...base, checkoutStartedAt: { not: null } } }),
      db.quizSession.count({ where: { ...base, purchasedAt: { not: null } } }),
    ]),
    db.quizSession.findMany({ where: { utmSource: { not: null } }, distinct: ["utmSource"], select: { utmSource: true }, take: 40 }),
    getPublishedQuiz(),
  ]);
  const [cStarted, cCompleted, cLeads, cOffer, cCheckout, cPurchased] = counts;
  const resultTitle = (k: string | null) => (k ? (quiz?.data.results.find((r) => r.key === k)?.title ?? k) : "—");
  const pct = (a: number) => (cStarted ? `${Math.round((a / cStarted) * 100)}%` : "—");
  const qs = (extra: Record<string, string>) => new URLSearchParams({ ...(Object.fromEntries(Object.entries(sp).filter(([, v]) => typeof v === "string")) as Record<string, string>), ...extra }).toString();
  const yes = (d: Date | null) => (d ? <Badge tone="green">sim</Badge> : <span className="text-slate-400">—</span>);

  return (
    <div>
      <PageHeader title="Leads e Quiz" description={`${p.label} · sessões do quiz (anônimas e identificadas). Respostas: acesso restrito e auditado.`} actions={<PeriodFilter current={p.key} from={p.fromInput} to={p.toInput} />} />

      <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Iniciaram" value={String(cStarted)} />
        <Stat label="Concluíram" value={String(cCompleted)} hint={pct(cCompleted)} />
        <Stat label="Identificadas" value={String(cLeads)} hint={pct(cLeads)} />
        <Stat label="Viram a oferta" value={String(cOffer)} hint={pct(cOffer)} />
        <Stat label="Checkout" value={String(cCheckout)} hint={pct(cCheckout)} />
        <Stat label="Compraram" value={String(cPurchased)} hint={pct(cPurchased)} />
      </section>

      <form className="mb-4 flex flex-wrap items-end gap-2" method="get">
        <input type="hidden" name="periodo" value={p.key} />
        <input type="hidden" name="de" value={p.fromInput} />
        <input type="hidden" name="ate" value={p.toInput} />
        <select name="etapa" defaultValue={stage} className={`${inputCls} w-auto`} aria-label="Etapa">
          <option value="">Todas as etapas</option>
          {Object.entries(STAGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select name="origem" defaultValue={source} className={`${inputCls} w-auto`} aria-label="Origem">
          <option value="">Todas as origens</option>
          {[...new Set(["facebook", "instagram", "google", "tiktok", "direto", ...sources.map((s) => s.utmSource!)])].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input name="q" defaultValue={q} placeholder="Nome ou e-mail" className={`${inputCls} w-56`} />
        <button className={btnSecondary}>Filtrar</button>
      </form>

      <Table
        rows={rows}
        rowKey={(r) => r.id}
        empty="Nenhuma sessão do quiz no período."
        columns={[
          { key: "i", label: "Início", render: (r) => formatDate(r.startedAt, true) },
          { key: "u", label: "Última interação", render: (r) => formatDate(r.lastInteractionAt, true) },
          { key: "l", label: "Lead", render: (r) => (r.email ? <Link href={`/admin/leads/${r.id}`} className="font-semibold hover:underline">{r.name || r.email}<span className="block text-xs font-normal text-slate-500">{r.email}</span></Link> : <Link href={`/admin/leads/${r.id}`} className="text-slate-500 hover:underline">{r.anonymizedAt ? "anonimizada" : "anônima"}</Link>) },
          { key: "e", label: "Etapas", align: "right", render: (r) => r.stepsCompleted },
          { key: "c", label: "Concluiu", render: (r) => yes(r.completedAt) },
          { key: "r", label: "Resultado editorial", render: (r) => <span className="block max-w-[200px] truncate">{resultTitle(r.resultKey)}</span> },
          { key: "o", label: "Oferta", render: (r) => yes(r.offerViewedAt) },
          { key: "k", label: "Checkout", render: (r) => yes(r.checkoutStartedAt) },
          { key: "p", label: "Pedido", render: (r) => (r.order ? <Link href={`/admin/pedidos/${r.order.id}`} className="underline">{r.order.orderNumber}</Link> : "—") },
          { key: "s", label: "Origem", render: (r) => r.utmSource ?? r.channel ?? "—" },
        ]}
      />
      <Pagination page={page} pages={Math.ceil(total / PER_PAGE)} makeHref={(n) => `/admin/leads?${qs({ page: String(n) })}`} />
      <p className="mt-4 text-xs text-slate-500">Retenção: respostas são apagadas e leads sem compra anonimizados após o prazo definido em Configurações → Privacidade. Nenhum dado do quiz é enviado ao Meta/Google.</p>
    </div>
  );
}
