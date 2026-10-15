import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Badge, PageHeader, Pagination, ORDER_TONE, inputCls, btnPrimary } from "@/components/admin/ui";
import { Table } from "@/components/admin/Table";
import { PeriodFilter } from "@/components/admin/PeriodFilter";
import { ORDER_STATUS_LABEL } from "@/lib/domain";
import { db } from "@/lib/db";
import { formatBRL, formatDate, formatPhone } from "@/utils/format";
import { resolvePeriod } from "@/server/admin/period";
import { RowActions } from "@/components/admin/RowActions";
import { deleteOrder, quickResendEmail } from "./actions";

export const metadata = { title: "Pedidos" };
type SP = Promise<Record<string, string | string[] | undefined>>;
const PER_PAGE = 30;

export default async function OrdersPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const p = resolvePeriod({ periodo: "30d", ...sp });
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const status = typeof sp.status === "string" ? sp.status : "";
  const metodo = sp.metodo === "CREDIARIO" || sp.metodo === "PIX" ? sp.metodo : "";
  const page = Math.max(1, Number(sp.page) || 1);

  const where: Prisma.OrderWhereInput = {
    createdAt: { gte: p.from, lt: p.to },
    ...(metodo ? { paymentMethod: metodo } : {}),
    ...(status && status in ORDER_STATUS_LABEL ? { status: status as keyof typeof ORDER_STATUS_LABEL } : {}),
    ...(q
      ? {
          OR: [
            { orderNumber: { contains: q, mode: "insensitive" } },
            { customer: { name: { contains: q, mode: "insensitive" } } },
            { customer: { email: { contains: q, mode: "insensitive" } } },
            { customer: { phone: { contains: q.replace(/\D/g, "") || q } } },
            { utmCampaign: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [orders, count, children] = await Promise.all([
    db.order.findMany({ where, include: { customer: true, items: { select: { kind: true, productName: true, quantity: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * PER_PAGE, take: PER_PAGE }),
    db.order.count({ where }),
    db.order.groupBy({ by: ["parentOrderId"], where: { parentOrderId: { not: null }, status: { in: ["PAID", "CREDIARIO_APROVADO"] } }, _count: true }),
  ]);
  const upsellCount = new Map(children.map((c) => [c.parentOrderId, c._count]));
  const qs = (extra: Record<string, string>) => new URLSearchParams({ ...(Object.fromEntries(Object.entries(sp).filter(([, v]) => typeof v === "string")) as Record<string, string>), ...extra }).toString();

  return (
    <div>
      <PageHeader title="Pedidos" description={`${count} pedido(s) · ${p.label}`} actions={<PeriodFilter current={p.key} from={p.fromInput} to={p.toInput} />} />
      <form className="mb-4 flex flex-wrap gap-2">
        {["periodo", "de", "ate"].map((k) => typeof sp[k] === "string" && <input key={k} type="hidden" name={k} value={sp[k] as string} />)}
        <input name="q" defaultValue={q} placeholder="Buscar nº, cliente, e-mail, telefone, campanha" className={`${inputCls} max-w-sm`} />
        <select name="status" defaultValue={status} className={`${inputCls} w-auto`} aria-label="Status">
          <option value="">Todos os status</option>
          {Object.entries(ORDER_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className={btnPrimary}>Filtrar</button>
      </form>
      <Table
        rows={orders}
        rowKey={(o) => o.id}
        empty="Nenhum pedido encontrado."
        columns={[
          {
            key: "id",
            label: "Pedido · data e hora",
            render: (o) => (
              <div className="whitespace-nowrap">
                <Link href={`/admin/pedidos/${o.id}`} className="font-semibold underline-offset-2 hover:underline">{o.orderNumber}</Link>
                <span className="block text-xs text-slate-500">{formatDate(o.createdAt, true)}</span>
              </div>
            ),
          },
          { key: "c", label: "Cliente", render: (o) => o.customer.name },
          { key: "v", label: "Valor", align: "right", render: (o) => formatBRL(o.totalCents) },
          { key: "s", label: "Status", render: (o) => <Badge tone={ORDER_TONE[o.status] ?? "slate"}>{ORDER_STATUS_LABEL[o.status]}</Badge> },
          {
            key: "a",
            label: "Ações",
            render: (o) => <RowActions id={o.id} primary={quickResendEmail} onDelete={deleteOrder} deleteConfirm={`Excluir o pedido ${o.orderNumber} definitivamente? Itens, pagamentos e e-mails dele também serão apagados.`} />,
          },
          { key: "w", label: "WhatsApp", render: (o) => formatPhone(o.customer.phone) },
          { key: "e", label: "E-mail", render: (o) => <span className="block max-w-[180px] truncate">{o.customer.email}</span> },
          { key: "p", label: "Produto", render: (o) => <span className="block max-w-[200px] truncate">{o.items.filter((i) => i.kind === "PRODUCT" || i.kind === "UPSELL" || i.kind === "CROSS_SELL").map((i) => i.productName).join(", ")}</span> },
          { key: "b", label: "Bumps", align: "right", render: (o) => o.items.filter((i) => i.kind === "ORDER_BUMP").length || "—" },
          { key: "u", label: "Upsells", align: "right", render: (o) => (o.source === "UPSELL" ? <Badge tone="blue">upsell</Badge> : upsellCount.get(o.id) ?? "—") as React.ReactNode },
          { key: "pg", label: "Pagamento", render: (o) => o.paymentMethod },
          { key: "o", label: "Origem", render: (o) => o.utmSource ?? o.channel ?? "—" },
          { key: "cp", label: "Campanha", render: (o) => o.utmCampaign ?? "—" },
        ]}
      />
      <Pagination page={page} pages={Math.ceil(count / PER_PAGE)} makeHref={(pg) => `?${qs({ page: String(pg) })}`} />
    </div>
  );
}
