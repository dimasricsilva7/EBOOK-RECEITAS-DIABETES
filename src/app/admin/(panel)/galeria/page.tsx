import { Badge, Card, Field, PageHeader, inputCls } from "@/components/admin/ui";
import { ActionForm, ConfirmAction, SubmitButton } from "@/components/admin/client";
import { MediaInput } from "@/components/admin/inputs";
import { GALLERY_CATEGORIES } from "@/lib/domain";
import { db } from "@/lib/db";
import { deleteGalleryItem, saveGalleryItem } from "../cms-actions";

export const metadata = { title: "Galeria" };
type Item = Awaited<ReturnType<typeof db.galleryItem.findMany>>[number];

function ItemForm({ g }: { g: Item | null }) {
  return (
    <ActionForm action={saveGalleryItem} resetOnSuccess={!g} className="grid gap-3 md:grid-cols-2">
      {g && <input type="hidden" name="id" value={g.id} />}
      <div className="md:col-span-2"><MediaInput name="imageUrl" label="Imagem" defaultValue={g?.imageUrl} folder="galeria" /></div>
      <Field label="Título"><input name="title" defaultValue={g?.title ?? ""} className={inputCls} /></Field>
      <Field label="Categoria">
        <select name="category" defaultValue={g?.category ?? "Pixel Art"} className={inputCls}>{GALLERY_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
      </Field>
      <Field label="Texto alternativo (acessibilidade)"><input name="alt" defaultValue={g?.alt ?? ""} className={inputCls} /></Field>
      <Field label="Ordem"><input name="sortOrder" type="number" defaultValue={g?.sortOrder ?? 0} className={inputCls} /></Field>
      <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="active" defaultChecked={g?.active ?? true} className="h-4 w-4" /> Ativa</label>
      <div className="md:col-span-2"><SubmitButton>{g ? "Salvar" : "Adicionar à galeria"}</SubmitButton></div>
    </ActionForm>
  );
}

export default async function GalleryAdminPage() {
  const items = await db.galleryItem.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  return (
    <div className="space-y-6">
      <PageHeader title="Galeria" description="Use imagens originais, próprias ou licenciadas. Evite personagens protegidos por direitos autorais sem autorização." />
      <Card title="Nova imagem"><ItemForm g={null} /></Card>
      <div className="grid gap-4 lg:grid-cols-2">
        {items.map((g) => (
          <Card
            key={g.id}
            title={`${g.sortOrder}. ${g.title}`}
            actions={
              <span className="flex gap-1">
                {g.imageUrl.startsWith("/placeholders/") && <Badge tone="amber">ilustração provisória</Badge>}
                {g.active ? <Badge tone="green">ativa</Badge> : <Badge>oculta</Badge>}
              </span>
            }
          >
            <ItemForm g={g} />
            <div className="mt-3 border-t border-slate-100 pt-3"><ConfirmAction action={deleteGalleryItem} label="Remover" danger hidden={{ id: g.id }} /></div>
          </Card>
        ))}
      </div>
    </div>
  );
}
