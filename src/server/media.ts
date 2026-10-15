import "server-only";
import { unstable_cache } from "next/cache";
import { videoEmbedUrl } from "@/components/ui/VideoEmbed";

/**
 * O arquivo de mídia responde? (ex.: armazenamento da Vercel bloqueado → 403).
 * Links do YouTube/Vimeo e arquivos do próprio site não são verificados.
 * Resultado em cache por 10 min para não atrasar a página.
 */
const check = unstable_cache(
  async (url: string) => {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 1200);
      const res = await fetch(url, { method: "GET", headers: { Range: "bytes=0-0" }, signal: ctrl.signal, cache: "no-store" });
      clearTimeout(t);
      res.body?.cancel().catch(() => {});
      return res.ok || res.status === 206;
    } catch {
      return true; // falha de rede/timeout na verificação: não esconde por precaução
    }
  },
  ["media-available"],
  { revalidate: 600 }
);

export async function isMediaAvailable(url: string | null | undefined) {
  if (!url) return false;
  if (url.startsWith("/") || videoEmbedUrl(url)) return true;
  return check(url);
}
