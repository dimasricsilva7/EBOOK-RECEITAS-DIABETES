import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageHeader, inputCls } from "@/components/admin/ui";
import { ConfirmAction } from "@/components/admin/client";
import { db } from "@/lib/db";
import { formatBRL, formatDate } from "@/utils/format";
import { ProductForm } from "../ProductForm";
import { deleteProduct } from "../actions";
import { MaterialsCard } from "../MaterialsCard";

export const metadata = { title: "Editar produto" };

export default async function EditProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ salvo?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const [product, all, history, materials] = await Promise.all([
    db.product.findUnique({ where: { id } }),
    db.product.findMany({ select: { id: true, name: true, active: true }, orderBy: { sortOrder: "asc" } }),
    db.priceHistory.findMany({ where: { productId: id }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.digitalMaterial.findMany({ where: { productId: id }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
  ]);
  if (!product) notFound();
  return (
    <div className="space-y-6">
      <PageHeader
        title={product.name}
        description={sp.salvo ? "Produto criado com sucesso." : `Atualizado em ${formatDate(product.updatedAt, true)}`}
        actions={product.active ? <Link href="/#oferta" target="_blank" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium">Ver na landing</Link> : undefined}
      />
      <ProductForm product={product} all={all} />
      <MaterialsCard productId={product.id} materials={materials} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Histórico de preço">
          {history.length ? (
            <ul className="space-y-1 text-sm">
              {history.map((h) => (
                <li key={h.id}>{formatDate(h.createdAt, true)} · {h.oldPriceCents != null ? `${formatBRL(h.oldPriceCents)} → ` : "inicial "}<b>{formatBRL(h.newPriceCents)}</b></li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">Sem alterações registradas.</p>
          )}
        </Card>
        <Card title="Excluir produto">
          <p className="mb-3 text-sm text-slate-600">Pedidos antigos continuam com o snapshot do produto. Prefira desativar se não tiver certeza.</p>
          <ConfirmAction action={deleteProduct} label="Excluir produto" danger description='Digite EXCLUIR para confirmar.' hidden={{ id: product.id }}>
            <input name="confirm" placeholder="EXCLUIR" className={inputCls} />
          </ConfirmAction>
        </Card>
      </div>
    </div>
  );
}
