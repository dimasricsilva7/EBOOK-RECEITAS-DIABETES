import Link from "next/link";
import { Badge, PageHeader, btnPrimary } from "@/components/admin/ui";
import { Table } from "@/components/admin/Table";
import { CATEGORY_LABEL } from "@/lib/domain";
import { db } from "@/lib/db";
import { formatBRL } from "@/utils/format";
import { duplicateProduct, moveProduct, toggleProduct } from "./actions";

export const metadata = { title: "Produtos" };

export default async function ProductsPage() {
  const products = await db.product.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], include: { _count: { select: { materials: { where: { status: "READY" } } } } } });
  const small = "rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium hover:bg-slate-50";
  return (
    <div>
      <PageHeader title="Produtos" description="Produto principal, materiais complementares, order bumps e upsells. Capa, preço, textos e materiais 100% editáveis." actions={<Link href="/admin/produtos/novo" className={btnPrimary}>Novo produto</Link>} />
      <Table
        rows={products}
        rowKey={(p) => p.id}
        columns={[
          {
            key: "o",
            label: "Ordem",
            render: (p) => (
              <span className="flex gap-1">
                <form action={moveProduct}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="dir" value="up" /><button className={small} aria-label="Subir">↑</button></form>
                <form action={moveProduct}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="dir" value="down" /><button className={small} aria-label="Descer">↓</button></form>
              </span>
            ),
          },
          { key: "n", label: "Produto", render: (p) => <Link href={`/admin/produtos/${p.id}`} className="font-semibold hover:underline">{p.name}</Link> },
          { key: "c", label: "Categoria", render: (p) => CATEGORY_LABEL[p.category] },
          { key: "p", label: "Preço", align: "right", render: (p) => (p.priceCents > 0 ? formatBRL(p.priceCents) : <Badge tone="amber">definir</Badge>) },
          { key: "e", label: "Materiais prontos", render: (p) => (p._count.materials ? <Badge tone="green">{p._count.materials}</Badge> : <Badge tone="amber">nenhum — não vende</Badge>) },
          { key: "s", label: "Status", render: (p) => (p.active ? <Badge tone="green">ativo</Badge> : <Badge>inativo</Badge>) },
          { key: "d", label: "Destaque", render: (p) => (p.featured ? "★" : "") },
          {
            key: "a",
            label: "Ações",
            render: (p) => (
              <span className="flex gap-1">
                <Link href={`/admin/produtos/${p.id}`} className={small}>Editar</Link>
                <form action={toggleProduct}><input type="hidden" name="id" value={p.id} /><button className={small}>{p.active ? "Desativar" : "Ativar"}</button></form>
                <form action={duplicateProduct}><input type="hidden" name="id" value={p.id} /><button className={small}>Duplicar</button></form>
                              </span>
            ),
          },
        ]}
      />
      <p className="mt-3 text-xs text-slate-500">Produtos sem preço ou sem material pronto não podem ser comprados. Pedidos antigos guardam nome e preço da época da compra.</p>
    </div>
  );
}
