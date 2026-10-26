import { Card, PageHeader } from "@/components/admin/ui";
import { Table } from "@/components/admin/Table";
import { db } from "@/lib/db";

export const metadata = { title: "Leads do quiz" };

/** Leads capturados pelo quiz (/quiz). Cada lead é um e-mail + as respostas. */
export default async function QuizLeadsPage() {
  const leads = await db.supportMessage.findMany({
    where: { subject: "Lead do quiz" },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: { id: true, email: true, message: true, createdAt: true },
  });
  return (
    <div className="space-y-6">
      <PageHeader title="Leads do quiz" description={`${leads.length} e-mail(s) capturado(s) pelo quiz. Exporte e use na sua ferramenta de e-mail quando quiser.`} />
      <Card title="E-mails capturados">
        <Table
          rows={leads}
          rowKey={(r) => r.id}
          empty="Nenhum lead do quiz ainda."
          columns={[
            { key: "email", label: "E-mail", render: (r) => <span className="font-medium text-slate-900">{r.email}</span> },
            { key: "respostas", label: "Respostas", render: (r) => <span className="whitespace-pre-line text-xs text-slate-600">{r.message}</span> },
            { key: "data", label: "Quando", align: "right", render: (r) => new Date(r.createdAt).toLocaleString("pt-BR") },
          ]}
        />
      </Card>
    </div>
  );
}
