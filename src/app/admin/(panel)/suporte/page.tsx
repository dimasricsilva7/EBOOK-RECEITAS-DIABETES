import { Badge, PageHeader } from "@/components/admin/ui";
import { Table } from "@/components/admin/Table";
import { db } from "@/lib/db";
import { formatDate } from "@/utils/format";
import { toggleSupportStatus } from "./actions";

export const metadata = { title: "Suporte" };

/** Mensagens do formulário /suporte (também enviadas por e-mail ao atendimento, quando configurado). */
export default async function SupportAdminPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const filter = status === "RESOLVED" ? "RESOLVED" : status === "ALL" ? undefined : "OPEN";
  const rows = await db.supportMessage.findMany({ where: filter ? { status: filter } : {}, orderBy: { createdAt: "desc" }, take: 200 });
  const tab = (v: string, l: string) => (
    <a href={`/admin/suporte?status=${v}`} className={`rounded-lg px-3 py-1.5 text-sm ${((filter ?? "ALL") === v) ? "bg-slate-900 text-white" : "border border-slate-300 bg-white"}`}>{l}</a>
  );
  return (
    <div>
      <PageHeader title="Suporte" description="Responda pelo seu e-mail (o botão abre uma resposta para a cliente)." actions={<div className="flex gap-2">{tab("OPEN", "Abertas")}{tab("RESOLVED", "Resolvidas")}{tab("ALL", "Todas")}</div>} />
      <Table
        rows={rows}
        rowKey={(r) => r.id}
        empty="Nenhuma mensagem."
        columns={[
          { key: "d", label: "Data", render: (r) => formatDate(r.createdAt, true) },
          { key: "n", label: "De", render: (r) => <span>{r.name}<span className="block text-xs text-slate-500">{r.email}</span></span> },
          { key: "p", label: "Pedido", render: (r) => r.orderNumber ?? "—" },
          { key: "s", label: "Assunto / mensagem", render: (r) => <details className="max-w-[420px] whitespace-normal"><summary className="cursor-pointer font-medium">{r.subject}</summary><p className="mt-1 whitespace-pre-line text-slate-600">{r.message}</p></details> },
          { key: "e", label: "E-mail", render: (r) => (r.emailSentAt ? <Badge tone="green">avisado</Badge> : <Badge tone="amber" >{r.emailError ? "não enviado" : "—"}</Badge>) },
          {
            key: "a",
            label: "Ações",
            render: (r) => (
              <span className="flex gap-1">
                <a href={`mailto:${r.email}?subject=${encodeURIComponent(`Re: ${r.subject}`)}`} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium">Responder</a>
                <form action={toggleSupportStatus}><input type="hidden" name="id" value={r.id} /><button className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium">{r.status === "OPEN" ? "Marcar resolvida" : "Reabrir"}</button></form>
              </span>
            ),
          },
        ]}
      />
    </div>
  );
}
