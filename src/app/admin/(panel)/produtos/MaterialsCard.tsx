import type { DigitalMaterial } from "@prisma/client";
import { Badge, Card, Field, inputCls, textareaCls } from "@/components/admin/ui";
import { ActionForm, ConfirmAction, SubmitButton } from "@/components/admin/client";
import { MediaInput } from "@/components/admin/inputs";
import { MATERIAL_FORMAT_LABEL, MATERIAL_STATUS_LABEL } from "@/lib/domain";
import { deleteMaterial, moveMaterial, saveMaterial, setMaterialStatus } from "./materials-actions";
import { MaterialUpload } from "./MaterialUpload";

const TONE = { PENDING: "amber", READY: "green", ARCHIVED: "slate" } as const;
const mb = (n: number | null) => (n ? `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : "");

function MaterialForm({ productId, m }: { productId: string; m?: DigitalMaterial }) {
  return (
    <ActionForm action={saveMaterial} className="grid gap-3 sm:grid-cols-2" resetOnSuccess={!m}>
      <input type="hidden" name="productId" value={productId} />
      {m && <input type="hidden" name="id" value={m.id} />}
      <Field label="Título" className="sm:col-span-2"><input name="title" required defaultValue={m?.title ?? ""} placeholder="Ex.: Guia Além da Fome (e-book)" className={inputCls} /></Field>
      <Field label="O que é" className="sm:col-span-2"><textarea name="description" rows={2} defaultValue={m?.description ?? ""} className={textareaCls} /></Field>
      <Field label="Como usar"><textarea name="howToUse" rows={2} defaultValue={m?.howToUse ?? ""} className={textareaCls} /></Field>
      <Field label="Finalidade educativa"><textarea name="purpose" rows={2} defaultValue={m?.purpose ?? ""} className={textareaCls} /></Field>
      <Field label="Formato">
        <select name="format" defaultValue={m?.format ?? "PDF"} className={inputCls}>
          {Object.entries(MATERIAL_FORMAT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Field>
      <Field label="Status" hint="Só materiais PRONTOS aparecem na landing e são entregues.">
        <select name="status" defaultValue={m?.status ?? "PENDING"} className={inputCls}>
          {Object.entries(MATERIAL_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Field>
      <Field label="Entrega" hint="Arquivo: privado, guardado no site. Link: ex.: vídeo não listado ou pasta compartilhada.">
        <select name="source" defaultValue={m?.source ?? "file"} className={inputCls}>
          <option value="file">Arquivo enviado (privado)</option>
          <option value="link">Link externo (https)</option>
        </select>
      </Field>
      <Field label="Link (se a entrega for por link)"><input name="externalUrl" defaultValue={m?.externalUrl ?? ""} placeholder="https://…" className={inputCls} /></Field>
      <div className="sm:col-span-2">
        <MediaInput name="coverUrl" label="Capa do material (opcional — só imagem do material real)" defaultValue={m?.coverUrl} folder="materials" />
      </div>
      <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2">
        <input type="checkbox" name="showOnLanding" defaultChecked={m?.showOnLanding ?? true} className="h-4 w-4" /> Mostrar na seção &quot;Conteúdo incluído&quot; da landing (quando pronto)
      </label>
      <div className="sm:col-span-2"><SubmitButton>{m ? "Salvar material" : "Adicionar material"}</SubmitButton></div>
    </ActionForm>
  );
}

/** Materiais reais do produto. Nada é anunciado ou entregue enquanto estiver "Em produção". */
export function MaterialsCard({ productId, materials }: { productId: string; materials: DigitalMaterial[] }) {
  const small = "rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium hover:bg-slate-50";
  const ready = materials.filter((m) => m.status === "READY").length;
  return (
    <Card title={`Materiais digitais (${ready} pronto(s) de ${materials.length})`}>
      {ready === 0 && (
        <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Nenhum material pronto: este produto <b>não pode ser vendido</b> (o checkout recusa) e a seção &quot;Conteúdo incluído&quot; fica oculta. Cadastre os materiais reais e envie os arquivos.
        </p>
      )}
      <ul className="space-y-3">
        {materials.map((m) => {
          const deliverable = m.source === "link" ? Boolean(m.externalUrl) : Boolean(m.uploadId);
          return (
            <li key={m.id} className="rounded-xl border border-slate-200 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex gap-1">
                  <form action={moveMaterial}><input type="hidden" name="id" value={m.id} /><input type="hidden" name="dir" value="up" /><button className={small} aria-label="Subir">↑</button></form>
                  <form action={moveMaterial}><input type="hidden" name="id" value={m.id} /><input type="hidden" name="dir" value="down" /><button className={small} aria-label="Descer">↓</button></form>
                </span>
                <p className="min-w-0 flex-1 font-semibold">{m.title}</p>
                <Badge tone={TONE[m.status]}>{MATERIAL_STATUS_LABEL[m.status]}</Badge>
                <Badge>{MATERIAL_FORMAT_LABEL[m.format]}</Badge>
                {m.showOnLanding && m.status === "READY" && <Badge tone="blue">na landing</Badge>}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-600">
                {m.source === "file" ? (deliverable ? <span>Arquivo: {m.fileName} · {mb(m.fileSize)}</span> : <span className="font-semibold text-amber-700">Arquivo ainda não enviado</span>) : deliverable ? <span className="truncate">Link: {m.externalUrl}</span> : <span className="font-semibold text-amber-700">Link não informado</span>}
                {m.source === "file" && <MaterialUpload materialId={m.id} hasFile={Boolean(m.uploadId)} />}
                {m.status !== "READY" && deliverable && (
                  <form action={setMaterialStatus}><input type="hidden" name="id" value={m.id} /><input type="hidden" name="status" value="READY" /><button className={small}>Marcar como pronto</button></form>
                )}
                {m.status === "READY" && (
                  <form action={setMaterialStatus}><input type="hidden" name="id" value={m.id} /><input type="hidden" name="status" value="ARCHIVED" /><button className={small}>Arquivar</button></form>
                )}
              </div>
              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-semibold text-slate-700">Editar</summary>
                <div className="mt-3 space-y-3">
                  <MaterialForm productId={productId} m={m} />
                  <ConfirmAction action={deleteMaterial} label="Excluir material" danger description='Digite EXCLUIR. Pedidos já pagos perdem o acesso a este material.' hidden={{ id: m.id }}>
                    <input name="confirm" placeholder="EXCLUIR" className={inputCls} />
                  </ConfirmAction>
                </div>
              </details>
            </li>
          );
        })}
      </ul>
      <details className="mt-4 rounded-xl border border-dashed border-slate-300 p-3" open={materials.length === 0}>
        <summary className="cursor-pointer text-sm font-semibold">+ Novo material</summary>
        <div className="mt-3"><MaterialForm productId={productId} /></div>
      </details>
      <p className="mt-3 text-xs text-slate-500">Arquivos até 80 MB (PDF, ZIP, EPUB, áudio, vídeo curto). Ficam privados: só quem tem pedido pago acessa, por link com token. Vídeos longos: use um link (ex.: YouTube/Vimeo não listado).</p>
    </Card>
  );
}
