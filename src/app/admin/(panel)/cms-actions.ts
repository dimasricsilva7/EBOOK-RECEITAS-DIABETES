"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { GALLERY_CATEGORIES, ICONS } from "@/lib/domain";
import { refreshStore, withAdmin, withAdminVoid, type ActionResult } from "@/server/admin/guard";
import { bool, int, jsonArray, optStr, str, stringList } from "@/server/admin/forms";

const url = (fd: FormData, k: string) => {
  const v = optStr(fd, k, 500);
  return v && /^(https:\/\/|\/)/.test(v) ? v : null;
};
const asRecord = (v: unknown) => v as Record<string, unknown>;
const iconItems = (fd: FormData, k: string) =>
  jsonArray<{ icon?: string; title?: string; text?: string }>(fd, k)
    .filter((i) => i?.title)
    .slice(0, 12)
    .map((i) => ({ icon: (ICONS as readonly string[]).includes(i.icon ?? "") ? i.icon : "leaf", title: String(i.title).slice(0, 90), text: String(i.text ?? "").slice(0, 400) }));
const steps = (fd: FormData, k: string) =>
  jsonArray<{ title?: string; text?: string }>(fd, k)
    .filter((s) => s?.title)
    .slice(0, 10)
    .map((s) => ({ title: String(s.title).slice(0, 90), text: String(s.text ?? "").slice(0, 400) }));

const isIcon = (v: unknown) => ((ICONS as readonly string[]).includes(String(v ?? "")) ? String(v) : "leaf");
const safeImg = (v: unknown) => {
  const x = String(v ?? "").trim();
  return /^(https:\/\/|\/)/.test(x) ? x.slice(0, 500) : "";
};
const cards = (fd: FormData, k: string) =>
  jsonArray<{ icon?: string; title?: string; text?: string; image?: string; alt?: string }>(fd, k)
    .filter((c) => c?.title)
    .slice(0, 4)
    .map((c) => ({ icon: isIcon(c.icon), title: String(c.title).slice(0, 140), text: String(c.text ?? "").slice(0, 300), image: safeImg(c.image), alt: String(c.alt ?? "").slice(0, 160) }));
const detailSteps = (fd: FormData, k: string) =>
  jsonArray<{ icon?: string; title?: string; text?: string; detail?: string }>(fd, k)
    .filter((s) => s?.title)
    .slice(0, 6)
    .map((s) => ({ icon: isIcon(s.icon), title: String(s.title).slice(0, 60), text: String(s.text ?? "").slice(0, 240), detail: String(s.detail ?? "").slice(0, 600) }));

/** Campos específicos de cada tipo de seção → `config`. */
function parseConfig(type: string, fd: FormData, prev: Record<string, unknown>): Record<string, unknown> {
  const c: Record<string, unknown> = { ...prev };
  c.eyebrow = str(fd, "cfg_eyebrow", 60);
  c.anchor = str(fd, "cfg_anchor", 40).toLowerCase().replace(/[^a-z0-9-]/g, "");
  switch (type) {
    case "hero":
      c.badges = stringList(fd, "cfg_badges").slice(0, 4);
      c.imageAlt = str(fd, "cfg_imageAlt", 160);
      c.secondaryLabel = str(fd, "cfg_secondaryLabel", 50);
      c.secondaryTarget = str(fd, "cfg_secondaryTarget", 200);
      break;
    case "identification":
      c.items = cards(fd, "cfg_items");
      break;
    case "cycle":
      c.steps = detailSteps(fd, "cfg_steps");
      break;
    case "patterns":
    case "experience":
      c.steps = steps(fd, "cfg_steps");
      if (type === "experience") {
        c.imageNote = str(fd, "cfg_imageNote", 120);
        c.imageAlt = str(fd, "cfg_imageAlt", 160);
      }
      break;
    case "method":
    case "trust":
    case "topics":
    case "facts":
      c.items = iconItems(fd, "cfg_items");
      break;
    case "showcase":
      c.formatItems = stringList(fd, "cfg_formatItems").slice(0, 8);
      c.previewTitle = str(fd, "cfg_previewTitle", 80);
      c.excerpts = stringList(fd, "cfg_excerpts").slice(0, 3).map((t) => t.slice(0, 280));
      c.imageAlt = str(fd, "cfg_imageAlt", 160);
      break;
    case "author":
      c.name = str(fd, "cfg_name", 80);
      c.role = str(fd, "cfg_role", 120);
      c.context = str(fd, "cfg_context", 600);
      c.confirmed = bool(fd, "cfg_confirmed") ? "true" : "false";
      c.imageAlt = str(fd, "cfg_imageAlt", 160);
      break;
    case "audience":
      c.forYouTitle = str(fd, "cfg_forYouTitle", 60);
      c.notForYouTitle = str(fd, "cfg_notForYouTitle", 60);
      c.forYou = stringList(fd, "cfg_forYou").slice(0, 10);
      c.notForYou = stringList(fd, "cfg_notForYou").slice(0, 10);
      break;
    case "offer":
      c.includes = stringList(fd, "cfg_includes").slice(0, 8);
      c.steps = steps(fd, "cfg_steps").slice(0, 3);
      break;
    case "video":
      c.vertical = bool(fd, "cfg_vertical") ? "true" : "false";
      break;
  }
  return c;
}

export async function saveSection(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return withAdmin("EDITOR", async (admin) => {
    const key = str(fd, "key", 40);
    const before = await db.landingSection.findUniqueOrThrow({ where: { key } });
    const config = parseConfig(before.type, fd, (before.config ?? {}) as Record<string, unknown>);
    const after = await db.landingSection.update({
      where: { key },
      data: {
        active: bool(fd, "active"),
        title: optStr(fd, "title", 200),
        subtitle: optStr(fd, "subtitle", 1200),
        body: optStr(fd, "body", 4000),
        imageUrl: url(fd, "imageUrl"),
        videoUrl: url(fd, "videoUrl"),
        ctaLabel: optStr(fd, "ctaLabel", 60),
        ctaTarget: optStr(fd, "ctaTarget", 200),
        config: config as Prisma.InputJsonValue,
      },
    });
    await audit(admin.id, "landing_section_updated", "landingSection", key, { summary: `Seção "${before.label}" atualizada`, before: asRecord(before), after: asRecord(after) });
    refreshStore("landing");
    revalidatePath("/admin/landing");
    return { ok: true, message: "Seção salva. A landing page já foi atualizada." };
  });
}

export async function moveSection(fd: FormData) {
  await withAdminVoid("EDITOR", async (admin) => {
    const key = str(fd, "key", 40);
    const dir = str(fd, "dir", 4) === "up" ? -1 : 1;
    const list = await db.landingSection.findMany({ orderBy: { sortOrder: "asc" }, select: { key: true, label: true } });
    const i = list.findIndex((s) => s.key === key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    await db.$transaction(list.map((s, idx) => db.landingSection.update({ where: { key: s.key }, data: { sortOrder: idx + 1 } })));
    await audit(admin.id, "landing_reordered", "landingSection", key, { summary: `Ordem da landing: "${list[j].label}" movida` });
    refreshStore("landing");
    revalidatePath("/admin/landing");
  });
}

export async function toggleSection(fd: FormData) {
  await withAdminVoid("EDITOR", async (admin) => {
    const s = await db.landingSection.findUniqueOrThrow({ where: { key: str(fd, "key", 40) } });
    await db.landingSection.update({ where: { key: s.key }, data: { active: !s.active } });
    await audit(admin.id, "landing_section_updated", "landingSection", s.key, { summary: `Seção "${s.label}" ${s.active ? "desativada" : "ativada"}`, before: { active: s.active }, after: { active: !s.active } });
    refreshStore("landing");
    revalidatePath("/admin/landing");
  });
}

// ───────────── Galeria ─────────────

export async function saveGalleryItem(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return withAdmin("EDITOR", async (admin) => {
    const id = optStr(fd, "id", 40);
    const imageUrl = url(fd, "imageUrl");
    if (!imageUrl) return { error: "Envie a imagem ou informe a URL." };
    const category = str(fd, "category", 40);
    const data = {
      title: str(fd, "title", 80) || "Criação",
      category: (GALLERY_CATEGORIES as readonly string[]).includes(category) ? category : "Diversos",
      imageUrl,
      alt: str(fd, "alt", 160),
      sortOrder: int(fd, "sortOrder", 0),
      active: bool(fd, "active"),
    };
    if (id) {
      const before = await db.galleryItem.findUniqueOrThrow({ where: { id } });
      const after = await db.galleryItem.update({ where: { id }, data });
      await audit(admin.id, "gallery_updated", "galleryItem", id, { summary: `Galeria: "${after.title}" atualizada`, before: asRecord(before), after: asRecord(after) });
    } else {
      const created = await db.galleryItem.create({ data });
      await audit(admin.id, "gallery_created", "galleryItem", created.id, { summary: `Galeria: "${created.title}" adicionada` });
    }
    refreshStore("gallery");
    revalidatePath("/admin/galeria");
    return { ok: true, message: "Salvo." };
  });
}

export async function deleteGalleryItem(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return withAdmin("EDITOR", async (admin) => {
    const g = await db.galleryItem.delete({ where: { id: str(fd, "id", 40) } });
    await audit(admin.id, "gallery_deleted", "galleryItem", g.id, { summary: `Galeria: "${g.title}" removida` });
    refreshStore("gallery");
    revalidatePath("/admin/galeria");
    return { ok: true, message: "Removido." };
  });
}

// ───────────── FAQ ─────────────

export async function saveFaq(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return withAdmin("EDITOR", async (admin) => {
    const id = optStr(fd, "id", 40);
    const data = { question: str(fd, "question", 200), answer: str(fd, "answer", 3000), sortOrder: int(fd, "sortOrder", 0), active: bool(fd, "active") };
    if (!data.question || !data.answer) return { error: "Informe pergunta e resposta." };
    if (data.active && data.answer.includes("[PREENCHER]")) return { error: "Complete a resposta (remova [PREENCHER]) antes de ativar." };
    if (id) {
      const before = await db.faq.findUniqueOrThrow({ where: { id } });
      const after = await db.faq.update({ where: { id }, data });
      await audit(admin.id, "faq_updated", "faq", id, { summary: `FAQ: "${after.question}"`, before: asRecord(before), after: asRecord(after) });
    } else {
      const created = await db.faq.create({ data });
      await audit(admin.id, "faq_created", "faq", created.id, { summary: `FAQ criada: "${created.question}"` });
    }
    refreshStore("faq");
    revalidatePath("/admin/faq");
    return { ok: true, message: "Salvo." };
  });
}

export async function deleteFaq(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return withAdmin("EDITOR", async (admin) => {
    const f = await db.faq.delete({ where: { id: str(fd, "id", 40) } });
    await audit(admin.id, "faq_deleted", "faq", f.id, { summary: `FAQ removida: "${f.question}"` });
    refreshStore("faq");
    revalidatePath("/admin/faq");
    return { ok: true, message: "Removida." };
  });
}

// ───────────── Avaliações (somente reais) ─────────────

export async function saveReview(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return withAdmin("EDITOR", async (admin) => {
    const id = optStr(fd, "id", 40);
    const rating = Math.max(1, Math.min(5, int(fd, "rating", 5)));
    const date = str(fd, "reviewedAt", 10);
    const productId = optStr(fd, "productId", 40);
    const data = {
      name: str(fd, "name", 80),
      text: str(fd, "text", 2000),
      rating,
      photoUrl: url(fd, "photoUrl"),
      videoUrl: url(fd, "videoUrl"),
      productId: productId || null,
      reviewedAt: /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T12:00:00-03:00`) : null,
      approved: bool(fd, "approved"),
      featured: bool(fd, "featured"),
      sortOrder: int(fd, "sortOrder", 0),
    };
    if (!data.name || !data.text) return { error: "Informe nome e texto da avaliação." };
    if (data.approved && !bool(fd, "confirmReal")) return { error: "Confirme que a avaliação é real e autorizada pelo cliente para publicá-la." };
    if (id) {
      const before = await db.review.findUniqueOrThrow({ where: { id } });
      const after = await db.review.update({ where: { id }, data });
      await audit(admin.id, "review_updated", "review", id, { summary: `Avaliação de ${after.name} ${before.approved !== after.approved ? (after.approved ? "aprovada" : "despublicada") : "atualizada"}`, before: asRecord(before), after: asRecord(after) });
    } else {
      const created = await db.review.create({ data });
      await audit(admin.id, "review_created", "review", created.id, { summary: `Avaliação cadastrada: ${created.name}` });
    }
    refreshStore("reviews");
    revalidatePath("/admin/avaliacoes");
    return { ok: true, message: "Salvo." };
  });
}

export async function deleteReview(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return withAdmin("EDITOR", async (admin) => {
    const r = await db.review.delete({ where: { id: str(fd, "id", 40) } });
    await audit(admin.id, "review_deleted", "review", r.id, { summary: `Avaliação removida: ${r.name}` });
    refreshStore("reviews");
    revalidatePath("/admin/avaliacoes");
    return { ok: true, message: "Removida." };
  });
}
