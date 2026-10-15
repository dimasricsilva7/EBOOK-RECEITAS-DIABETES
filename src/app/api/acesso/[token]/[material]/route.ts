import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request";
import { resolveMaterialAccess } from "@/server/orders";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const page = (msg: string, status: number) =>
  new NextResponse(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="robots" content="noindex"><title>Acesso</title><body style="font-family:Georgia,serif;background:#FAF6F1;color:#3B2A22;padding:40px 20px;max-width:520px;margin:auto"><h1 style="font-weight:400">Acesso ao material</h1><p style="font-family:system-ui;line-height:1.6">${msg}</p><p style="font-family:system-ui"><a href="/acesso" style="color:#A65B42">Recuperar meu acesso</a> · <a href="/suporte" style="color:#A65B42">Falar com o suporte</a></p></body>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } }
  );

/**
 * Entrega de um material comprado: valida token do acesso (pedido pago, não revogado, dentro do prazo)
 * e o material (pronto e do produto comprado). Arquivo privado → stream direto do banco; link → redireciona.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string; material: string }> }) {
  const ip = getClientIp(req.headers);
  if (!rateLimit(`dl:${ip}`, 40, 10 * 60_000)) return page("Muitas tentativas seguidas. Aguarde alguns minutos.", 429);
  const { token, material } = await params;
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token) || !/^[A-Za-z0-9_-]{6,40}$/.test(material)) return page("Link inválido.", 404);

  const r = await resolveMaterialAccess(token, material);
  if (!r.ok) return page(r.reason, r.status);
  const m = r.material;

  if (m.source === "link" && m.externalUrl) {
    return NextResponse.redirect(m.externalUrl, { status: 302, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  }

  const chunks = await db.materialChunk.findMany({ where: { materialId: m.id, uploadId: m.uploadId! }, orderBy: { index: "asc" }, select: { id: true } });
  if (!chunks.length) return page("Este material está indisponível no momento. Fale com o suporte.", 404);

  // Stream parte a parte (cada parte ≤ 3,5 MB) — nunca carrega o arquivo inteiro na memória
  let i = 0;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (i >= chunks.length) return controller.close();
      const part = await db.materialChunk.findUnique({ where: { id: chunks[i++].id }, select: { data: true } });
      if (part) controller.enqueue(new Uint8Array(part.data));
    },
  });
  const inline = /^(application\/pdf|audio\/|video\/|image\/)/.test(m.mimeType ?? "");
  const name = (m.fileName || m.title).replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "material";
  return new NextResponse(stream, {
    headers: {
      "Content-Type": m.mimeType || "application/octet-stream",
      ...(m.fileSize ? { "Content-Length": String(m.fileSize) } : {}),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${name}"; filename*=UTF-8''${encodeURIComponent(m.fileName || name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex",
      "Referrer-Policy": "no-referrer",
    },
  });
}
