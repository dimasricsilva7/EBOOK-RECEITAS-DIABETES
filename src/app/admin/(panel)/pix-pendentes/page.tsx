import Link from "next/link";
import { Badge, PageHeader, Stat, ORDER_TONE } from "@/components/admin/ui";
import { Table } from "@/components/admin/Table";
import { ORDER_STATUS_LABEL } from "@/lib/domain";
import { siteUrl } from "@/lib/env";
import { db } from "@/lib/db";
import { formatBRL, formatDate, formatPhone } from "@/utils/format";
import { pendingPix } from "@/server/admin/reports";
import { getSettings } from "@/server/settings";

export const metadata = { title: "PIX pendentes" };
type SP = Promise<Record<string, string | string[] | undefined>>;

function since(d: Date) {
  const m = Math.round((Date.now() - d.getTime()) / 60000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h} h ${m % 60} min` : `${Math.floor(h / 24)} dias`;
}

function fill(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

export default async function PendingPixPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const includeExpired = sp.expirados === "1";
  const [orders, settings, template] = await Promise.all([pendingPix(includeExpired), getSettings(), db.messageTemplate.findFirst({ where: { channel: "WHATSAPP", active: true }, orderBy: { createdAt: "asc" } })]);
  const total = orders.filter((o) => o.status === "PIX_GENERATED").reduce((s, o) => s + o.totalCents, 0);
  const base = siteUrl();

  return (
    <div>
      <PageHeader
        title="PIX pendentes"
        description="PIX gerados e ainda não pagos. Nenhuma mensagem é enviada automaticamente."
        actions={
          <Link href={includeExpired ? "?" : "?expirados=1"} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium">
            {includeExpired ? "Somente pendentes" : "Incluir expirados (14 dias)"}
          </Link>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="Pendentes agora" value={String(orders.filter((o) => o.status === "PIX_GENERATED").length)} />
        <Stat label="Valor pendente" value={formatBRL(total)} />
        {includeExpired && <Stat label="Expirados (14 dias)" value={String(orders.filter((o) => o.status === "EXPIRED").length)} />}
      </div>
      <Table
        rows={orders}
        rowKey={(o) => o.id}
        empty="Nenhum PIX pendente. 🎉"
        columns={[
          { key: "n", label: "Pedido", render: (o) => <Link href={`/admin/pedidos/${o.id}`} className="font-semibold text-slate-900 underline-offset-2 hover:underline">{o.orderNumber}</Link> },
          { key: "c", label: "Cliente", render: (o) => <span>{o.customer.name}<span className="block text-xs text-slate-500">{formatPhone(o.customer.phone)}</span></span> },
          { key: "v", label: "Valor", align: "right", render: (o) => formatBRL(o.totalCents) },
          { key: "p", label: "Produto", render: (o) => <span className="block max-w-[220px] truncate">{o.items.filter((i) => i.kind !== "ORDER_BUMP").map((i) => `${i.quantity}× ${i.productName}`).join(", ")}</span> },
          { key: "d", label: "Gerado em", render: (o) => formatDate(o.createdAt, true) },
          { key: "t", label: "Há", render: (o) => since(o.createdAt) },
          { key: "s", label: "Status", render: (o) => <Badge tone={ORDER_TONE[o.status] ?? "slate"}>{ORDER_STATUS_LABEL[o.status]}</Badge> },
          { key: "o", label: "Origem", render: (o) => o.utmSource ?? o.channel ?? "—" },
          { key: "cp", label: "Campanha", render: (o) => o.utmCampaign ?? "—" },
          {
            key: "r",
            label: "Recuperação",
            render: (o) => {
              if (!template) return <span className="text-xs text-slate-400">sem modelo</span>;
              const digits = o.customer.phone.replace(/\D/g, "");
              const text = fill(template.body, {
                primeiro_nome: o.customer.name.split(/\s+/)[0],
                loja: settings.store_name,
                pedido: o.orderNumber ?? "",
                valor: formatBRL(o.totalCents),
                link: `${base}/pedido/${o.orderNumber}?t=${o.accessToken}`,
              });
              return (
                <span className="flex items-center gap-2">
                  <a href={`https://wa.me/55${digits}?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer" className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white">
                    WhatsApp
                  </a>
                  {o.customer.marketingConsent ? <Badge tone="green">consentiu</Badge> : <Badge>sem opt-in</Badge>}
                </span>
              );
            },
          },
        ]}
      />
      <p className="mt-3 text-xs text-slate-500">
        O botão abre o WhatsApp com a mensagem preenchida para envio manual. Edite o texto em Configurações → Mensagens. Respeite a preferência de contato do cliente.
      </p>
    </div>
  );
}
