import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, EmptyState, PageHeader, inputCls } from "@/components/admin/ui";
import { ConfirmAction } from "@/components/admin/client";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { ORDER_STATUS_LABEL } from "@/lib/domain";
import { formatDate } from "@/utils/format";
import { getPublishedQuiz } from "@/server/quiz";
import { deleteLeadAction } from "../actions";

export const metadata = { title: "Lead" };
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

/** Histórico individual do quiz. A visualização das respostas fica registrada na auditoria. */
export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (admin.role === "EDITOR") return <EmptyState title="Acesso restrito" text="Disponível apenas para administradores." />;
  const { id } = await params;
  const s = await db.quizSession.findUnique({ where: { id }, include: { answers: { orderBy: { answeredAt: "asc" } }, order: { select: { id: true, orderNumber: true, status: true } } } });
  if (!s) notFound();
  await audit(admin.id, "lead_viewed", "quizSession", id, { summary: `Respostas do quiz visualizadas (${s.email ?? "anônima"})` });
  const quiz = await getPublishedQuiz();
  const result = s.resultKey ? quiz?.data.results.find((r) => r.key === s.resultKey) : null;
  const rows: [string, string | null][] = [
    ["Início", formatDate(s.startedAt, true)],
    ["Última interação", formatDate(s.lastInteractionAt, true)],
    ["Consentimento das respostas", s.consentAt ? formatDate(s.consentAt, true) : "não"],
    ["Etapas concluídas", String(s.stepsCompleted)],
    ["Concluiu o quiz", s.completedAt ? formatDate(s.completedAt, true) : "não"],
    ["Identificada em", s.identifiedAt ? formatDate(s.identifiedAt, true) : "anônima"],
    ["Aceita comunicações de marketing", s.marketingConsent ? "sim" : "não"],
    ["Viu a oferta", s.offerViewedAt ? formatDate(s.offerViewedAt, true) : "não"],
    ["Iniciou checkout", s.checkoutStartedAt ? formatDate(s.checkoutStartedAt, true) : "não"],
    ["Comprou", s.purchasedAt ? formatDate(s.purchasedAt, true) : "não"],
    ["Origem", [s.utmSource, s.utmMedium, s.utmCampaign].filter(Boolean).join(" / ") || s.channel],
    ["Dispositivo", s.device],
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={s.name || s.email || (s.anonymizedAt ? "Lead anonimizada" : "Sessão anônima")}
        description={s.email ?? "Sem nome/e-mail informados"}
        actions={
          <ConfirmAction action={deleteLeadAction} label="Excluir dados deste lead" danger confirmLabel="Excluir definitivamente" description="Apaga a sessão, as respostas, nome e e-mail (pedido da titular — LGPD). Pedidos de compra não são apagados. Digite EXCLUIR." hidden={{ id }}>
            <input name="confirm" placeholder="EXCLUIR" className={inputCls} />
          </ConfirmAction>
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Jornada">
          <dl className="grid grid-cols-[1fr_1.2fr] gap-x-3 gap-y-1.5 text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-slate-500">{k}</dt>
                <dd>{v || "—"}</dd>
              </div>
            ))}
          </dl>
          {s.order && (
            <p className="mt-4 border-t border-slate-100 pt-3 text-sm">
              Pedido: <Link href={`/admin/pedidos/${s.order.id}`} className="font-semibold underline">{s.order.orderNumber}</Link> <Badge>{ORDER_STATUS_LABEL[s.order.status]}</Badge>
            </p>
          )}
        </Card>
        <Card title="Resultado editorial">
          {result ? (
            <>
              <p className="font-semibold">{result.title}</p>
              {result.subtitle && <p className="mt-1 text-sm text-slate-600">{result.subtitle}</p>}
            </>
          ) : (
            <p className="text-sm text-slate-500">{s.resultKey ?? "Ainda não concluiu."}</p>
          )}
          <p className="mt-3 text-xs text-slate-500">Resultado editorial (conteúdo educativo), não é diagnóstico.</p>
        </Card>
      </div>
      <Card title={`Respostas (${s.answers.length})`}>
        {s.answers.length ? (
          <ol className="space-y-3 text-sm">
            {s.answers.map((a) => (
              <li key={a.id}>
                <p className="font-medium">{a.questionTitle}</p>
                <p className="text-slate-600">{arr(a.optionLabels).join(" · ")}</p>
                <p className="text-xs text-slate-400">{formatDate(a.answeredAt, true)}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-slate-500">{s.anonymizedAt ? "Respostas apagadas pela política de retenção." : "Nenhuma resposta registrada."}</p>
        )}
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">Informação potencialmente sensível. Use apenas para atendimento e melhoria do conteúdo. Não exporte para ferramentas de anúncio nem crie públicos com base nestas respostas.</p>
      </Card>
    </div>
  );
}
