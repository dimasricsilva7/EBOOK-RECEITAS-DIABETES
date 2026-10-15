import { PageHeader } from "@/components/admin/ui";
import { db } from "@/lib/db";
import { ProductForm } from "../ProductForm";

export const metadata = { title: "Novo produto" };

export default async function NewProductPage() {
  const all = await db.product.findMany({ select: { id: true, name: true, active: true }, orderBy: { sortOrder: "asc" } });
  return (
    <div>
      <PageHeader title="Novo produto" description="Produtos sem preço definido ficam inativos." />
      <ProductForm product={null} all={all} />
    </div>
  );
}
