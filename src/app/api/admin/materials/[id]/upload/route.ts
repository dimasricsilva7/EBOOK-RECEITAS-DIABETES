import { NextResponse, type NextRequest } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { getCurrentAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { isSameOrigin } from "@/lib/request";
import { revalidateTag } from "next/cache";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Parte de até 3,5 MB (limite de corpo das funções da Vercel ≈ 4,5 MB). Arquivo total até 80 MB. */
const MAX_CHUNK = 3.6 * 1024 * 1024;
const MAX_FILE = 80 * 1024 * 1024;
const MAX_CHUNKS = Math.ceil(MAX_FILE / (3.5 * 1024 * 1024)) + 1;
const ALLOWED = /^(application\/pdf|application\/zip|application\/epub\+zip|audio\/(mpeg|mp4|x-m4a|aac|wav|ogg)|video\/(mp4|webm|quicktime)|image\/(png|jpeg|webp))$/;

async function guard(req: NextRequest, id: string) {
  if (!isSameOrigin(req)) return { error: NextResponse.json({ error: "Origem inválida" }, { status: 403 }) };
  const admin = await getCurrentAdmin();
  if (!admin || admin.role === "EDITOR") return { error: NextResponse.json({ error: "Sem permissão ou sessão expirada." }, { status: 401 }) };
  const material = await db.digitalMaterial.findUnique({ where: { id }, select: { id: true, title: true, productId: true, uploadId: true } });
  if (!material) return { error: NextResponse.json({ error: "Material não encontrado." }, { status: 404 }) };
  return { admin, material };
}

/**
 * Upload em partes (arquivo PRIVADO, guardado no banco). Parâmetros: ?uploadId=…&index=N (corpo = bytes da parte).
 * O arquivo novo só substitui o anterior quando /finish confirma que todas as partes chegaram.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await guard(req, id);
  if ("error" in g) return g.error;
  const uploadId = req.nextUrl.searchParams.get("uploadId") ?? "";
  const index = Number.parseInt(req.nextUrl.searchParams.get("index") ?? "", 10);
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(uploadId) || !Number.isInteger(index) || index < 0 || index >= MAX_CHUNKS) return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  const buf = Buffer.from(await req.arrayBuffer());
  if (!buf.length || buf.length > MAX_CHUNK) return NextResponse.json({ error: "Parte do arquivo com tamanho inválido." }, { status: 413 });
  await db.materialChunk.upsert({
    where: { materialId_uploadId_index: { materialId: id, uploadId, index } },
    update: { data: buf, size: buf.length },
    create: { materialId: id, uploadId, index, data: buf, size: buf.length },
  });
  return NextResponse.json({ ok: true, index });
}

/** Conclui: confere partes e tamanho, calcula SHA-256, ativa o novo arquivo e apaga versões antigas. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await guard(req, id);
  if ("error" in g) return g.error;
  const body = (await req.json().catch(() => null)) as { uploadId?: string; fileName?: string; mimeType?: string; size?: number; chunks?: number } | null;
  if (!body?.uploadId || !/^[A-Za-z0-9_-]{8,40}$/.test(body.uploadId)) return NextResponse.json({ error: "Upload inválido." }, { status: 400 });
  const mimeType = String(body.mimeType || "application/octet-stream").toLowerCase();
  if (!ALLOWED.test(mimeType)) return NextResponse.json({ error: "Formato não aceito. Use PDF, ZIP, EPUB, MP3/M4A/WAV, MP4/WEBM ou imagem." }, { status: 415 });
  const size = Number(body.size ?? 0);
  if (!size || size > MAX_FILE) return NextResponse.json({ error: "Arquivo acima de 80 MB. Para vídeos longos, use um link (ex.: vídeo não listado)." }, { status: 413 });

  const parts = await db.materialChunk.findMany({ where: { materialId: id, uploadId: body.uploadId }, orderBy: { index: "asc" }, select: { id: true, index: true, size: true } });
  const total = parts.reduce((s, p) => s + p.size, 0);
  if (parts.length !== Number(body.chunks) || parts.some((p, i) => p.index !== i) || total !== size) {
    return NextResponse.json({ error: "O envio ficou incompleto. Tente enviar o arquivo de novo." }, { status: 409 });
  }
  const hash = crypto.createHash("sha256");
  for (const p of parts) {
    const row = await db.materialChunk.findUnique({ where: { id: p.id }, select: { data: true } });
    if (row) hash.update(row.data);
  }
  const fileName = String(body.fileName || "material").replace(/[\\/:*?"<>|]+/g, "_").slice(0, 160);
  await db.digitalMaterial.update({ where: { id }, data: { source: "file", uploadId: body.uploadId, fileName, mimeType, fileSize: size, fileSha256: hash.digest("hex"), chunkCount: parts.length } });
  await db.materialChunk.deleteMany({ where: { materialId: id, NOT: { uploadId: body.uploadId } } });
  await audit(g.admin.id, "material_file_uploaded", "material", id, { summary: `Arquivo enviado para "${g.material.title}": ${fileName} (${(size / 1024 / 1024).toFixed(1)} MB)` });
  revalidateTag("catalog");
  return NextResponse.json({ ok: true });
}
