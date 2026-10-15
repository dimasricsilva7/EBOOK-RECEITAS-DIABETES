"use client";

import { useState } from "react";
import { inputCls, textareaCls, btnSecondary } from "./ui";
import { ICONS } from "@/lib/domain";

/**
 * Reduz (máx. 2400px) e converte para WebP no navegador antes do envio, para caber no limite de
 * corpo das funções da Vercel (~4,5 MB). Formatos que o navegador não lê (HEIC) seguem originais.
 */
async function prepareImage(file: File, maxSide = 2400): Promise<File> {
  const base = file.name.replace(/\.[^.]+$/, "") || "imagem";
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let quality = 0.86;
    let blob: Blob | null = null;
    do {
      blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", quality));
      quality -= 0.1;
    } while (blob && blob.size > 3.8 * 1024 * 1024 && quality > 0.4);
    if (blob && blob.type === "image/webp") return new File([blob], `${base}.webp`, { type: "image/webp" });
  } catch {
    /* segue com o original */
  }
  return file;
}

const FOLDER_CATEGORY: Record<string, string> = { brand: "MARCA", hero: "HERO", products: "PRODUTO", materials: "MATERIAIS", landing: "LANDING", reviews: "DEPOIMENTOS", offers: "OFERTAS" };

async function readErr(res: Response, fallback: string) {
  const j = (await res.json().catch(() => null)) as { error?: string } | null;
  if (j?.error) return j.error;
  if (res.status === 413) return "Arquivo grande demais. Use uma imagem menor que 4 MB.";
  if (res.status === 401) return "Sua sessão expirou. Entre novamente no admin.";
  return `${fallback} (erro ${res.status}).`;
}

/**
 * Campo de imagem/vídeo com DUAS formas de envio:
 *  1. Enviar arquivo — a imagem é otimizada (WebP) e guardada no próprio banco, servida por /media/… com CDN;
 *  2. Colar link — usa o link direto (https) ou, com "Guardar cópia", baixa e guarda no site (não quebra se o
 *     site de origem sair do ar). Links internos/privados são bloqueados (proteção SSRF).
 * Vídeos: link do YouTube/Vimeo ou MP4 hospedado (arquivos de vídeo não são guardados no banco).
 */
export function MediaInput({ name, defaultValue, value, onChange, accept = "image/*", label, folder = "media" }: { name?: string; defaultValue?: string | null; value?: string; onChange?: (v: string) => void; accept?: string; label?: string; folder?: string }) {
  const [inner, setInner] = useState(defaultValue ?? "");
  // Controlado (dentro de listas) ou com estado próprio (campo de formulário)
  const url = value ?? inner;
  const setUrl = (v: string) => (onChange ? onChange(v) : setInner(v));
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isVideoField = accept.startsWith("video");
  const embed = /youtu\.?be/i.test(url) ? "YouTube" : /vimeo\.com/i.test(url) ? "Vimeo" : null;
  const isVideo = /\.(mp4|webm|mov)(\?|$)/i.test(url) || isVideoField;
  const category = FOLDER_CATEGORY[folder] ?? "OUTROS";

  async function onFile(file: File) {
    if (!file.type.startsWith("image/")) return setStatus("Envie uma imagem (JPG, PNG, WEBP). Para vídeo, cole um link do YouTube/Vimeo.");
    setBusy(true);
    setStatus("Otimizando e enviando…");
    try {
      const prepared = await prepareImage(file);
      if (prepared.size > 4.4 * 1024 * 1024) throw new Error("A imagem tem mais de 4 MB mesmo após otimizar. Reduza e tente de novo.");
      const fd = new FormData();
      fd.append("file", prepared);
      fd.append("name", file.name.replace(/\.[^.]+$/, ""));
      fd.append("category", category);
      const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error(await readErr(res, "Falha no envio"));
      const { asset } = (await res.json()) as { asset: { url: string } };
      setUrl(asset.url);
      setStatus("Imagem enviada ✓ — lembre de salvar");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Falha no envio");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!/^https?:\/\//.test(url)) return setStatus("Cole primeiro um link http(s) de imagem.");
    setBusy(true);
    setStatus("Baixando a imagem do link…");
    try {
      const res = await fetch("/api/admin/media/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url, mode: "download", category }) });
      if (!res.ok) throw new Error(await readErr(res, "Não foi possível importar"));
      const { asset } = (await res.json()) as { asset: { url: string } };
      setUrl(asset.url);
      setStatus("Cópia guardada no site ✓ — lembre de salvar");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Não foi possível importar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {label && <p className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>}
      <div className="flex flex-wrap gap-2 sm:flex-nowrap">
        <input name={name} value={url} onChange={(e) => setUrl(e.target.value.trim())} placeholder={isVideoField ? "Cole o link (YouTube, Vimeo ou MP4 https)" : "Cole o link da imagem (https://…) ou envie um arquivo"} className={inputCls} />
        {!isVideoField && (
          <label className={`${btnSecondary} cursor-pointer whitespace-nowrap ${busy ? "pointer-events-none opacity-50" : ""}`}>
            Enviar arquivo
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
        )}
        {!isVideoField && /^https?:\/\//.test(url) && (
          <button type="button" onClick={copyLink} disabled={busy} className={`${btnSecondary} whitespace-nowrap`} title="Baixa a imagem e guarda uma cópia otimizada no site">
            Guardar cópia
          </button>
        )}
        {url && (
          <button type="button" onClick={() => { setUrl(""); setStatus(null); }} className={`${btnSecondary} px-3`} aria-label="Limpar">
            ✕
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {status ?? (isVideoField ? "Aceita YouTube, Vimeo ou link direto de MP4 (https)." : "Envie do computador/celular ou cole um link público. \"Guardar cópia\" evita que a imagem quebre se o link sair do ar.")}
      </p>
      {url && url.startsWith("http:") && <p className="mt-1 text-xs font-semibold text-red-600">Use um link https:// — links http:// não são salvos.</p>}
      {url && embed && <p className="mt-2 text-xs font-semibold text-emerald-700">✓ Link de {embed} reconhecido — o vídeo será incorporado.</p>}
      {url && !isVideo && !embed && /^(https:|\/)/.test(url) && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="mt-2 h-24 w-24 rounded-lg border border-slate-200 object-cover" onError={(e) => ((e.currentTarget.style.display = "none"), setStatus("Não foi possível carregar a imagem desse link. Confira se o link é público e aponta direto para a imagem."))} />
      )}
      {url && isVideo && !embed && /^(https:|\/)/.test(url) && <video src={url} className="mt-2 h-32 rounded-lg border border-slate-200" controls preload="metadata" />}
    </div>
  );
}

export type ListField = { key: string; label: string; type?: "text" | "textarea" | "select" | "checkbox" | "media" | "number"; options?: readonly string[]; width?: string; placeholder?: string };

/**
 * Editor de listas JSON (especificações, passos, benefícios…).
 * Serializa em um <input hidden name=...> para a Server Action.
 */
export function ListEditor<T extends Record<string, unknown>>({ name, fields, defaultValue, addLabel = "Adicionar item", newItem, idKey }: { name: string; fields: ListField[]; defaultValue: T[]; addLabel?: string; newItem: () => T; idKey?: string }) {
  const [items, setItems] = useState<T[]>(defaultValue);
  const update = (i: number, key: string, value: unknown) => setItems((list) => list.map((it, j) => (j === i ? { ...it, [key]: value } : it)));
  const move = (i: number, d: -1 | 1) =>
    setItems((list) => {
      const next = [...list];
      const j = i + d;
      if (j < 0 || j >= next.length) return list;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={JSON.stringify(items)} />
      {items.map((it, i) => (
        <div key={idKey ? String(it[idKey]) : i} className="flex flex-wrap items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
          {fields.map((f) => (
            <div key={f.key} className={f.width ?? "min-w-[140px] flex-1"}>
              <p className="mb-0.5 text-[10px] font-semibold uppercase text-slate-400">{f.label}</p>
              {f.type === "textarea" ? (
                <textarea value={String(it[f.key] ?? "")} onChange={(e) => update(i, f.key, e.target.value)} rows={2} className={textareaCls} />
              ) : f.type === "select" ? (
                <select value={String(it[f.key] ?? "")} onChange={(e) => update(i, f.key, e.target.value)} className={inputCls}>
                  {f.options?.map((o) => <option key={o}>{o}</option>)}
                </select>
              ) : f.type === "checkbox" ? (
                <input type="checkbox" checked={Boolean(it[f.key])} onChange={(e) => update(i, f.key, e.target.checked)} className="mt-2 h-5 w-5" />
              ) : f.type === "media" ? (
                <MediaInput value={String(it[f.key] ?? "")} onChange={(v) => update(i, f.key, v)} folder="landing" />
              ) : f.type === "number" ? (
                <input type="number" value={String(it[f.key] ?? "")} onChange={(e) => update(i, f.key, e.target.value === "" ? null : Number(e.target.value))} className={inputCls} />
              ) : (
                <input value={String(it[f.key] ?? "")} onChange={(e) => update(i, f.key, e.target.value)} placeholder={f.placeholder} className={inputCls} />
              )}
            </div>
          ))}
          <div className="flex gap-1 self-end">
            <button type="button" onClick={() => move(i, -1)} className="h-10 w-8 rounded border border-slate-300 bg-white text-sm" aria-label="Subir">↑</button>
            <button type="button" onClick={() => move(i, 1)} className="h-10 w-8 rounded border border-slate-300 bg-white text-sm" aria-label="Descer">↓</button>
            <button type="button" onClick={() => setItems((l) => l.filter((_, j) => j !== i))} className="h-10 rounded border border-red-200 bg-white px-2 text-xs font-semibold text-red-600">Remover</button>
          </div>
        </div>
      ))}
      <button type="button" onClick={() => setItems((l) => [...l, newItem()])} className={btnSecondary}>
        + {addLabel}
      </button>
    </div>
  );
}

/** Lista simples de textos (ex.: itens de público, categorias). */
export function StringListEditor({ name, defaultValue, addLabel = "Adicionar" }: { name: string; defaultValue: string[]; addLabel?: string }) {
  return (
    <ListEditor
      name={`${name}__obj`}
      fields={[{ key: "v", label: "Texto" }]}
      defaultValue={defaultValue.map((v) => ({ v }))}
      newItem={() => ({ v: "" })}
      addLabel={addLabel}
    />
  );
}

/** Seleção múltipla de produtos → JSON de IDs. */
export function ProductMultiSelect({ name, products, defaultValue }: { name: string; products: { id: string; name: string; active: boolean }[]; defaultValue: string[] }) {
  const [sel, setSel] = useState<string[]>(defaultValue);
  return (
    <div>
      <input type="hidden" name={name} value={JSON.stringify(sel)} />
      <div className="flex flex-wrap gap-2">
        {products.map((p) => {
          const on = sel.includes(p.id);
          return (
            <button
              type="button"
              key={p.id}
              onClick={() => setSel((s) => (on ? s.filter((x) => x !== p.id) : [...s, p.id]))}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${on ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"} ${p.active ? "" : "opacity-60"}`}
              aria-pressed={on}
            >
              {p.name}
              {!p.active && " (inativo)"}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ───────────── Editores prontos (a função newItem fica no cliente) ─────────────


export function SpecsEditor({ name, defaultValue }: { name: string; defaultValue: Record<string, unknown>[] }) {
  return <ListEditor name={name} defaultValue={defaultValue} addLabel="Adicionar especificação" newItem={() => ({ label: "", value: "" })} fields={[{ key: "label", label: "Nome", placeholder: "Formato" }, { key: "value", label: "Valor" }]} />;
}

export function GalleryEditor({ name, defaultValue }: { name: string; defaultValue: Record<string, unknown>[] }) {
  return <ListEditor name={name} defaultValue={defaultValue} addLabel="Adicionar imagem" newItem={() => ({ url: "", alt: "" })} fields={[{ key: "url", label: "URL da imagem" }, { key: "alt", label: "Texto alternativo" }]} />;
}

export function IconItemsEditor({ name, defaultValue }: { name: string; defaultValue: Record<string, unknown>[] }) {
  return (
    <ListEditor
      name={name}
      defaultValue={defaultValue}
      addLabel="Adicionar item"
      newItem={() => ({ icon: "leaf", title: "", text: "" })}
      fields={[{ key: "icon", label: "Ícone", type: "select", options: ICONS, width: "w-32" }, { key: "title", label: "Título" }, { key: "text", label: "Texto", type: "textarea" }]}
    />
  );
}

/** Cards com imagem opcional (foto real ou ilustração) — ex.: identificação. */
export function CardsEditor({ name, defaultValue }: { name: string; defaultValue: Record<string, unknown>[] }) {
  return (
    <ListEditor
      name={name}
      defaultValue={defaultValue}
      addLabel="Adicionar card"
      newItem={() => ({ icon: "leaf", title: "", text: "", image: "", alt: "" })}
      fields={[
        { key: "icon", label: "Ilustração (sem foto)", type: "select", options: ICONS, width: "w-32" },
        { key: "title", label: "Frase curta" },
        { key: "text", label: "Complemento", type: "textarea" },
        { key: "image", label: "Foto (opcional)", type: "media", width: "w-full" },
        { key: "alt", label: "Descrição da foto", width: "w-full" },
      ]}
    />
  );
}

/** Etapas com explicação extra (ciclo interativo). */
export function DetailStepsEditor({ name, defaultValue }: { name: string; defaultValue: Record<string, unknown>[] }) {
  return (
    <ListEditor
      name={name}
      defaultValue={defaultValue}
      addLabel="Adicionar etapa"
      newItem={() => ({ icon: "leaf", title: "", text: "", detail: "" })}
      fields={[
        { key: "icon", label: "Ícone", type: "select", options: ICONS, width: "w-32" },
        { key: "title", label: "Etapa" },
        { key: "text", label: "Explicação curta", type: "textarea" },
        { key: "detail", label: "Explicação extra (ao tocar)", type: "textarea" },
      ]}
    />
  );
}

export function StepsEditor({ name, defaultValue }: { name: string; defaultValue: Record<string, unknown>[] }) {
  return <ListEditor name={name} defaultValue={defaultValue} addLabel="Adicionar passo" newItem={() => ({ title: "", text: "" })} fields={[{ key: "title", label: "Título" }, { key: "text", label: "Texto", type: "textarea" }]} />;
}

export function StatsEditor({ name, defaultValue }: { name: string; defaultValue: Record<string, unknown>[] }) {
  return <ListEditor name={name} defaultValue={defaultValue} addLabel="Adicionar indicador" newItem={() => ({ value: "", label: "" })} fields={[{ key: "value", label: "Número/destaque", width: "w-40" }, { key: "label", label: "Legenda" }]} />;
}

export function VariantsEditor({ name, defaultValue }: { name: string; defaultValue: Record<string, unknown>[] }) {
  return (
    <ListEditor
      name={name}
      defaultValue={defaultValue}
      addLabel="Adicionar variante"
      newItem={() => ({ key: String.fromCharCode(97 + Math.floor(Math.random() * 20)), label: "", weight: 50, value: "" })}
      fields={[{ key: "key", label: "Chave", width: "w-20" }, { key: "label", label: "Nome" }, { key: "weight", label: "Peso", type: "number", width: "w-20" }, { key: "value", label: "Valor (texto, URL, centavos, ID…)", type: "textarea" }]}
    />
  );
}
