"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { btnSecondary } from "@/components/admin/ui";

const CHUNK = 3.5 * 1024 * 1024;
const MAX = 80 * 1024 * 1024;

/** Envio do arquivo do material em partes de 3,5 MB (cabe no limite das funções), com progresso e retentativa por parte. */
export function MaterialUpload({ materialId, hasFile }: { materialId: string; hasFile: boolean }) {
  const router = useRouter();
  const [progress, setProgress] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function send(file: File) {
    if (file.size > MAX) return setMsg("Arquivo acima de 80 MB. Para vídeos longos, use a opção de link.");
    setMsg(null);
    setProgress(0);
    const uploadId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    const chunks = Math.max(1, Math.ceil(file.size / CHUNK));
    try {
      for (let i = 0; i < chunks; i++) {
        const part = file.slice(i * CHUNK, Math.min(file.size, (i + 1) * CHUNK));
        let ok = false;
        for (let attempt = 0; attempt < 3 && !ok; attempt++) {
          const res = await fetch(`/api/admin/materials/${materialId}/upload?uploadId=${uploadId}&index=${i}`, { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: part });
          if (res.ok) ok = true;
          else if (attempt === 2) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `Falha na parte ${i + 1}`);
        }
        setProgress(Math.round(((i + 1) / chunks) * 100));
      }
      const res = await fetch(`/api/admin/materials/${materialId}/upload`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uploadId, fileName: file.name, mimeType: file.type || "application/octet-stream", size: file.size, chunks }) });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Não foi possível concluir o envio.");
      setMsg("Arquivo enviado ✓ — agora você pode marcar o material como Pronto.");
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha no envio.");
    } finally {
      setProgress(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className={`${btnSecondary} cursor-pointer ${progress != null ? "pointer-events-none opacity-60" : ""}`}>
        {progress != null ? `Enviando… ${progress}%` : hasFile ? "Trocar arquivo" : "Enviar arquivo"}
        <input type="file" className="sr-only" accept=".pdf,.zip,.epub,audio/*,video/mp4,video/webm,image/png,image/jpeg,image/webp" onChange={(e) => e.target.files?.[0] && send(e.target.files[0])} />
      </label>
      {msg && <span className="text-xs text-slate-600">{msg}</span>}
    </div>
  );
}
