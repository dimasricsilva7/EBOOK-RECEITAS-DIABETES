"use server";

import { revalidatePath } from "next/cache";
import type { MaterialFormat, MaterialStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { refreshStore, withAdmin, withAdminVoid, type ActionResult } from "@/server/admin/guard";
import { bool, optStr, str } from "@/server/admin/forms";

const FORMATS: MaterialFormat[] = ["PDF", "VIDEO", "AUDIO", "WORKBOOK", "LINK", "OTHER"];
const STATUSES: MaterialStatus[] = ["PENDING", "READY", "ARCHIVED"];
const httpsUrl = (v: string | null) => (v && /^https:\/\/[^\s]{4,}$/.test(v) ? v : null);

/** Cria/edita um material. "Pronto" só é aceito com arquivo enviado (upload concluído) ou link https. */
export async function saveMaterial(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return withAdmin("ADMIN", async (admin) => {
    const id = optStr(fd, "id", 40);
    const productId = str(fd, "productId", 40);
    const title = str(fd, "title", 160);
    if (title.length < 2) return { error: "Informe o título do material." };
    if (!(await db.product.findUnique({ where: { id: productId }, select: { id: true } }))) return { error: "Produto inválido." };
    const format = (FORMATS.includes(str(fd, "format", 12) as MaterialFormat) ? str(fd, "format", 12) : "PDF") as MaterialFormat;
    const status = (STATUSES.includes(str(fd, "status", 12) as MaterialStatus) ? str(fd, "status", 12) : "PENDING") as MaterialStatus;
    const source = str(fd, "source", 8) === "link" ? "link" : "file";
    const externalUrl = httpsUrl(optStr(fd, "externalUrl", 1000));
    if (source === "link" && optStr(fd, "externalUrl", 1000) && !externalUrl) return { error: "O link do material precisa começar com https://" };
    const cover = optStr(fd, "coverUrl", 1000);
    const data = {
      productId,
      title,
      description: optStr(fd, "description", 1200),
      howToUse: optStr(fd, "howToUse", 800),
      purpose: optStr(fd, "purpose", 800),
      format,
      source,
      externalUrl: source === "link" ? externalUrl : null,
      showOnLanding: bool(fd, "showOnLanding"),
      coverUrl: cover && /^(https:\/\/|\/)/.test(cover) ? cover : null,
    };
    const existing = id ? await db.digitalMaterial.findUniqueOrThrow({ where: { id } }) : null;
    const deliverable = source === "link" ? Boolean(externalUrl) : Boolean(existing?.uploadId);
    if (status === "READY" && !deliverable) {
      return { error: source === "link" ? "Para marcar como pronto, informe o link https do material." : "Para marcar como pronto, salve e envie o arquivo primeiro (o status pode ser alterado depois do upload)." };
    }
    if (existing) {
      const after = await db.digitalMaterial.update({ where: { id: existing.id }, data: { ...data, status } });
      await audit(admin.id, "material_updated", "material", existing.id, { summary: `Material "${after.title}" atualizado`, before: existing as unknown as Record<string, unknown>, after: after as unknown as Record<string, unknown> });
    } else {
      const last = await db.digitalMaterial.aggregate({ where: { productId }, _max: { sortOrder: true } });
      const created = await db.digitalMaterial.create({ data: { ...data, status, sortOrder: (last._max.sortOrder ?? 0) + 1 } });
      await audit(admin.id, "material_created", "material", created.id, { summary: `Material criado: ${created.title}` });
    }
    refreshStore("catalog", "landing");
    revalidatePath(`/admin/produtos/${productId}`);
    return { ok: true, message: existing ? "Material salvo." : "Material criado. Se for arquivo, envie-o na lista abaixo." };
  });
}

export async function setMaterialStatus(fd: FormData) {
  await withAdminVoid("ADMIN", async (admin) => {
    const m = await db.digitalMaterial.findUniqueOrThrow({ where: { id: str(fd, "id", 40) } });
    const status = str(fd, "status", 12) as MaterialStatus;
    if (!STATUSES.includes(status)) return;
    if (status === "READY" && !(m.source === "link" ? m.externalUrl : m.uploadId)) return; // sem conteúdo não fica pronto
    await db.digitalMaterial.update({ where: { id: m.id }, data: { status } });
    await audit(admin.id, "material_updated", "material", m.id, { summary: `Material "${m.title}": ${m.status} → ${status}`, before: { status: m.status }, after: { status } });
    refreshStore("catalog", "landing");
    revalidatePath(`/admin/produtos/${m.productId}`);
  });
}

export async function moveMaterial(fd: FormData) {
  await withAdminVoid("ADMIN", async () => {
    const m = await db.digitalMaterial.findUniqueOrThrow({ where: { id: str(fd, "id", 40) } });
    const list = await db.digitalMaterial.findMany({ where: { productId: m.productId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true } });
    const i = list.findIndex((x) => x.id === m.id);
    const j = i + (str(fd, "dir", 4) === "up" ? -1 : 1);
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    await db.$transaction(list.map((x, idx) => db.digitalMaterial.update({ where: { id: x.id }, data: { sortOrder: idx + 1 } })));
    refreshStore("catalog", "landing");
    revalidatePath(`/admin/produtos/${m.productId}`);
  });
}

export async function deleteMaterial(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return withAdmin("ADMIN", async (admin) => {
    const m = await db.digitalMaterial.findUniqueOrThrow({ where: { id: str(fd, "id", 40) } });
    if (str(fd, "confirm", 20).toUpperCase() !== "EXCLUIR") return { error: 'Digite "EXCLUIR" para confirmar. Dica: para tirar do ar sem apagar, use "Arquivar".' };
    await db.digitalMaterial.delete({ where: { id: m.id } });
    await audit(admin.id, "material_deleted", "material", m.id, { summary: `Material excluído: ${m.title}` });
    refreshStore("catalog", "landing");
    revalidatePath(`/admin/produtos/${m.productId}`);
    return { ok: true, message: "Material excluído." };
  });
}
