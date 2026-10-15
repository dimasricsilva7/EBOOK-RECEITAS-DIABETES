import type { Product } from "@prisma/client";
import { Card, Field, inputCls, textareaCls } from "@/components/admin/ui";
import { ActionForm, SubmitButton } from "@/components/admin/client";
import { GalleryEditor, MediaInput, ProductMultiSelect, SpecsEditor } from "@/components/admin/inputs";
import { CATEGORY_LABEL } from "@/lib/domain";
import { centsToInput, toLocalInput } from "@/server/admin/forms";
import { saveProduct } from "./actions";

const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export function ProductForm({ product, all }: { product: Product | null; all: { id: string; name: string; active: boolean }[] }) {
  const p = product;
  const others = all.filter((x) => x.id !== p?.id);
  const check = (name: string, label: string, on: boolean) => (
    <label className="flex items-center gap-2 text-sm font-medium">
      <input type="checkbox" name={name} defaultChecked={on} className="h-4 w-4" /> {label}
    </label>
  );

  return (
    <ActionForm action={saveProduct} className="space-y-6">
      {p && <input type="hidden" name="id" value={p.id} />}
      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <Card title="Informações">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome" className="sm:col-span-2"><input name="name" required defaultValue={p?.name ?? ""} className={inputCls} /></Field>
              <Field label="Slug (URL)" hint="gerado do nome se vazio"><input name="slug" defaultValue={p?.slug ?? ""} className={inputCls} /></Field>
              <Field label="SKU"><input name="sku" defaultValue={p?.sku ?? ""} className={inputCls} /></Field>
              <Field label="Categoria" hint="O produto principal da landing é o ativo da categoria Programa principal.">
                <select name="category" defaultValue={p?.category ?? "PROGRAM"} className={inputCls}>
                  {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              <Field label="Subtítulo" hint="Aparece na oferta e no checkout"><input name="subtitle" defaultValue={p?.subtitle ?? ""} className={inputCls} /></Field>
              <Field label="Descrição curta" className="sm:col-span-2"><textarea name="shortDescription" rows={2} defaultValue={p?.shortDescription ?? ""} className={textareaCls} /></Field>
              <Field label="Descrição completa" className="sm:col-span-2" hint="Parágrafos separados por linha em branco. Links: [texto](/caminho)"><textarea name="description" rows={5} defaultValue={p?.description ?? ""} className={textareaCls} /></Field>
            </div>
          </Card>

          <Card title="Especificações">
            <SpecsEditor name="specs" defaultValue={arr(p?.specs)} />
            <p className="mt-2 text-xs text-slate-500">Ex.: formato, idioma, forma de acesso — somente dados confirmados.</p>
          </Card>

          <Card title="Capa, imagens e vídeo">
            <div className="space-y-4">
              <MediaInput name="imageUrl" label="Capa do produto (oferta, checkout e e-mails)" defaultValue={p?.imageUrl} folder="products" />
              <p className="-mt-2 text-xs text-slate-500">Use a capa/mockup do material REAL. Não apresente mockup de conteúdo que ainda não existe.</p>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Galeria</p>
                <GalleryEditor name="gallery" defaultValue={arr(p?.gallery)} />
              </div>
              <MediaInput name="videoUrl" label="Vídeo" accept="video/*" defaultValue={p?.videoUrl} folder="landing" />
            </div>
          </Card>

          <Card title="Entrega digital">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Formato de entrega (exibido na oferta)" className="sm:col-span-2"><input name="deliveryFormat" defaultValue={p?.deliveryFormat ?? ""} placeholder="Ex.: Acesso online + PDFs para baixar" className={inputCls} /></Field>
              <Field label="Instruções de acesso (área do cliente e e-mail)" className="sm:col-span-2"><textarea name="digitalDeliveryNote" rows={2} defaultValue={p?.digitalDeliveryNote ?? ""} placeholder="Ex.: Comece pelo guia e use o diário ao longo da semana." className={textareaCls} /></Field>
              <Field label="Limite de acessos por material" hint="vazio = ilimitado"><input name="digitalMaxDownloads" inputMode="numeric" defaultValue={p?.digitalMaxDownloads ?? ""} className={inputCls} /></Field>
              <Field label="Validade do acesso (dias)" hint="vazio = sem prazo"><input name="digitalValidityDays" inputMode="numeric" defaultValue={p?.digitalValidityDays ?? ""} className={inputCls} /></Field>
            </div>
            <p className="mt-3 text-xs text-slate-500">Os arquivos/links entregues são cadastrados em <b>Materiais digitais</b>, abaixo (após salvar o produto).</p>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Preço">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Preço (R$)"><input name="price" required inputMode="decimal" defaultValue={centsToInput(p?.priceCents ?? 0)} className={inputCls} /></Field>
              <Field label="Preço anterior (R$)" hint="Só use se o preço anterior for real."><input name="compareAt" inputMode="decimal" defaultValue={centsToInput(p?.compareAtPriceCents)} className={inputCls} /></Field>
            </div>
            <p className="mt-4 text-xs font-semibold uppercase text-slate-500">Promoção real (opcional)</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <Field label="Preço promocional"><input name="promoPrice" inputMode="decimal" defaultValue={centsToInput(p?.promoPriceCents)} className={inputCls} /></Field>
              <Field label="Texto"><input name="promoLabel" defaultValue={p?.promoLabel ?? ""} placeholder="Ex.: Semana das crianças" className={inputCls} /></Field>
              <Field label="Início"><input type="datetime-local" name="promoStartsAt" defaultValue={toLocalInput(p?.promoStartsAt)} className={inputCls} /></Field>
              <Field label="Fim"><input type="datetime-local" name="promoEndsAt" defaultValue={toLocalInput(p?.promoEndsAt)} className={inputCls} /></Field>
            </div>
            <p className="mt-2 text-xs text-slate-500">A promoção vale só entre as datas. Não há contagem regressiva automática.</p>
          </Card>

          <Card title="Publicação">
            <div className="space-y-3">
              {check("active", "Ativo (à venda)", p?.active ?? false)}
              {check("featured", "Destaque", p?.featured ?? false)}
              <Field label="Selo" hint='Ex.: "Produto digital educativo". "Mais vendido" só com dados reais.'>
                <input name="badge" list="badges" defaultValue={p?.badge ?? ""} className={inputCls} />
                <datalist id="badges"><option value="Produto digital educativo" /><option value="Material complementar" /></datalist>
              </Field>
              <Field label="Ordem"><input name="sortOrder" type="number" defaultValue={p?.sortOrder ?? 0} className={inputCls} /></Field>
            </div>
          </Card>

          <Card title="Relacionados">
            <p className="mb-2 text-xs text-slate-500">Sugestões complementares quando este produto estiver no pedido:</p>
            <ProductMultiSelect name="crossSellIds" products={others} defaultValue={arr(p?.crossSellIds)} />
            <p className="mb-2 mt-4 text-xs text-slate-500">Já inclusos neste produto (nunca oferecer como bump/upsell/cross-sell):</p>
            <ProductMultiSelect name="includedProductIds" products={others} defaultValue={arr(p?.includedProductIds)} />
          </Card>

          <Card title="SEO">
            <div className="space-y-3">
              <Field label="Título (até 70)"><input name="seoTitle" maxLength={70} defaultValue={p?.seoTitle ?? ""} className={inputCls} /></Field>
              <Field label="Descrição (até 170)"><textarea name="seoDescription" maxLength={170} rows={3} defaultValue={p?.seoDescription ?? ""} className={textareaCls} /></Field>
            </div>
          </Card>
        </div>
      </div>
      <div className="sticky bottom-0 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <SubmitButton>{p ? "Salvar alterações" : "Criar produto"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
