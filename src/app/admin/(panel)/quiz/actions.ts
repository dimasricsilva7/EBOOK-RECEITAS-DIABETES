"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { QUIZ_TEXT_DEFAULTS, type QuizTexts } from "@/lib/quiz";
import { withAdmin, withAdminVoid, type ActionResult } from "@/server/admin/guard";
import { bool, int, jsonArray, optStr, str, stringList } from "@/server/admin/forms";
import { draftTexts, publishQuiz } from "@/server/quiz";
import { slugify } from "@/utils/format";

const done = () => revalidatePath("/admin/quiz");

// ───────────── Perguntas e opções ─────────────

type OptIn = { id?: string; label?: string; resultKey?: string; weight?: number | string; nextQuestionId?: string };

export async function saveQuestion(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return withAdmin("ADMIN", async (admin) => {
    const id = optStr(fd, "id", 40);
    const title = str(fd, "title", 240);
    if (title.length < 3) return { error: "Escreva a pergunta." };
    const data = { title, helpText: optStr(fd, "helpText", 300), type: str(fd, "type", 10) === "multiple" ? "multiple" : "single", required: bool(fd, "required"), active: bool(fd, "active") };
    const options = jsonArray<OptIn>(fd, "options")
      .filter((o) => String(o.label ?? "").trim())
      .slice(0, 12)
      .map((o, i) => ({
        id: o.id && /^[a-z0-9]+$/i.test(o.id) ? o.id : undefined,
        label: String(o.label).trim().slice(0, 200),
        resultKey: o.resultKey ? String(o.resultKey).slice(0, 40) : null,
        weight: Math.max(0, Math.min(10, Number(o.weight ?? 1) || 0)),
        nextQuestionId: o.nextQuestionId ? String(o.nextQuestionId).slice(0, 40) : null,
        sortOrder: i,
      }));
    if (data.active && options.length < 2) return { error: "Uma pergunta ativa precisa de pelo menos 2 opções." };

    const q = await db.$transaction(async (tx) => {
      const question = id ? await tx.quizQuestion.update({ where: { id }, data }) : await tx.quizQuestion.create({ data: { ...data, sortOrder: ((await tx.quizQuestion.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? 0) + 1 } });
      const keep = options.filter((o) => o.id).map((o) => o.id!);
      await tx.quizOption.deleteMany({ where: { questionId: question.id, NOT: { id: { in: keep } } } });
      for (const o of options) {
        const { id: oid, ...rest } = o;
        if (oid) await tx.quizOption.updateMany({ where: { id: oid, questionId: question.id }, data: rest });
        else await tx.quizOption.create({ data: { ...rest, questionId: question.id } });
      }
      return question;
    });
    await audit(admin.id, id ? "quiz_question_updated" : "quiz_question_created", "quizQuestion", q.id, { summary: `Quiz (rascunho): pergunta "${q.title.slice(0, 60)}" ${id ? "atualizada" : "criada"}` });
    done();
    return { ok: true, message: "Pergunta salva no rascunho. Publique para valer no site." };
  });
}

export async function moveQuestion(fd: FormData) {
  await withAdminVoid("ADMIN", async () => {
    const id = str(fd, "id", 40);
    const list = await db.quizQuestion.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true } });
    const i = list.findIndex((x) => x.id === id);
    const j = i + (str(fd, "dir", 4) === "up" ? -1 : 1);
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    await db.$transaction(list.map((x, idx) => db.quizQuestion.update({ where: { id: x.id }, data: { sortOrder: idx + 1 } })));
    done();
  });
}

export async function toggleQuestion(fd: FormData) {
  await withAdminVoid("ADMIN", async (admin) => {
    const q = await db.quizQuestion.findUniqueOrThrow({ where: { id: str(fd, "id", 40) }, include: { _count: { select: { options: true } } } });
    if (!q.active && q._count.options < 2) return;
    await db.quizQuestion.update({ where: { id: q.id }, data: { active: !q.active } });
    await audit(admin.id, "quiz_question_updated", "quizQuestion", q.id, { summary: `Quiz (rascunho): pergunta ${q.active ? "desativada" : "ativada"}` });
    done();
  });
}

export async function deleteQuestion(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return withAdmin("ADMIN", async (admin) => {
    const q = await db.quizQuestion.delete({ where: { id: str(fd, "id", 40) } });
    await db.quizOption.updateMany({ where: { nextQuestionId: q.id }, data: { nextQuestionId: null } });
    await audit(admin.id, "quiz_question_deleted", "quizQuestion", q.id, { summary: `Quiz (rascunho): pergunta excluída "${q.title.slice(0, 60)}"` });
    done();
    return { ok: true, message: "Pergunta excluída do rascunho (respostas já registradas mantêm o texto original)." };
  });
}

// ───────────── Resultados editoriais ─────────────

export async function saveResult(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return withAdmin("ADMIN", async (admin) => {
    const id = optStr(fd, "id", 40);
    const key = slugify(str(fd, "key", 40)).replace(/-/g, "_");
    const title = str(fd, "title", 160);
    if (!key || !title) return { error: "Informe a chave e o título do resultado." };
    const data = {
      key,
      title,
      subtitle: optStr(fd, "subtitle", 300),
      body: optStr(fd, "body", 4000),
      points: stringList(fd, "points").slice(0, 8) as unknown as Prisma.InputJsonValue,
      reflection: optStr(fd, "reflection", 600),
      exercise: optStr(fd, "exercise", 2000),
      ctaLabel: optStr(fd, "ctaLabel", 60),
      ctaTarget: optStr(fd, "ctaTarget", 200),
      active: bool(fd, "active"),
      sortOrder: int(fd, "sortOrder", 0),
    };
    const forbidden = /(você tem|voce tem|diagnóstico de|transtorno|compulsiv[ao] alimentar|\bcura\b|tratamento garantido)/i;
    if (forbidden.test(`${title} ${data.subtitle ?? ""} ${data.body ?? ""} ${data.reflection ?? ""} ${data.exercise ?? ""}`)) return { error: "O texto parece afirmar diagnóstico, transtorno ou cura. Resultados devem ser editoriais e acolhedores — revise a redação." };
    const r = id ? await db.quizResult.update({ where: { id }, data }) : await db.quizResult.create({ data });
    await audit(admin.id, id ? "quiz_result_updated" : "quiz_result_created", "quizResult", r.id, { summary: `Quiz (rascunho): resultado "${r.title}" salvo` });
    done();
    return { ok: true, message: "Resultado salvo no rascunho." };
  });
}

export async function deleteResult(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return withAdmin("ADMIN", async (admin) => {
    const r = await db.quizResult.delete({ where: { id: str(fd, "id", 40) } });
    await db.quizOption.updateMany({ where: { resultKey: r.key }, data: { resultKey: null } });
    await audit(admin.id, "quiz_result_deleted", "quizResult", r.id, { summary: `Quiz (rascunho): resultado excluído "${r.title}"` });
    done();
    return { ok: true, message: "Resultado excluído do rascunho." };
  });
}

// ───────────── Textos e publicação ─────────────

export async function saveQuizTexts(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return withAdmin("ADMIN", async (admin) => {
    const before = await draftTexts();
    const next = { ...QUIZ_TEXT_DEFAULTS } as QuizTexts;
    for (const k of Object.keys(QUIZ_TEXT_DEFAULTS) as (keyof QuizTexts)[]) {
      if (typeof QUIZ_TEXT_DEFAULTS[k] === "boolean") (next as Record<string, unknown>)[k] = bool(fd, k);
      else (next as Record<string, unknown>)[k] = str(fd, k, 1200) || String(QUIZ_TEXT_DEFAULTS[k]);
    }
    await db.setting.upsert({ where: { key: "quiz_texts_draft" }, update: { value: next as unknown as Prisma.InputJsonValue, updatedBy: admin.id }, create: { key: "quiz_texts_draft", value: next as unknown as Prisma.InputJsonValue, updatedBy: admin.id } });
    await audit(admin.id, "quiz_texts_updated", "settings", "quiz_texts_draft", { summary: "Quiz (rascunho): textos atualizados", before: before as unknown as Record<string, unknown>, after: next as unknown as Record<string, unknown> });
    done();
    return { ok: true, message: "Textos salvos no rascunho." };
  });
}

export async function publishQuizAction(_: ActionResult): Promise<ActionResult> {
  return withAdmin("ADMIN", async (admin) => {
    const r = await publishQuiz(admin.id);
    if (!r.ok) return { error: `Não publicado: ${r.errors.join(" ")}` };
    await audit(admin.id, "quiz_published", "quizVersion", r.version.id, { summary: "Nova versão do quiz publicada" });
    revalidateTag("quiz");
    revalidatePath("/quiz");
    revalidatePath("/", "layout");
    done();
    return { ok: true, message: "Quiz publicado — o site já usa esta versão. Sessões em andamento terminam na versão em que começaram." };
  });
}
