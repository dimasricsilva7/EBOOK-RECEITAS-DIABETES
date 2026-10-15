import "server-only";
import { unstable_cache } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { log } from "@/lib/log";
import { classifyChannel, parseUserAgent } from "@/utils/channel";
import { QUIZ_TEXT_DEFAULTS, type QuizData, type QuizTexts } from "@/lib/quiz";

export { computeResult, nextQuestionId } from "@/lib/quiz";

/**
 * Quiz: o admin edita um RASCUNHO (tabelas QuizQuestion/QuizOption/QuizResult + textos em Setting
 * "quiz_texts_draft") e PUBLICA um snapshot imutável (QuizVersion). O site sempre usa a última versão
 * publicada; a pré-visualização do admin usa o rascunho.
 *
 * Privacidade: respostas podem revelar informações sensíveis. Só são gravadas com consentimento específico,
 * ficam restritas ao admin (papel ADMIN+), têm retenção limitada e NUNCA vão para Meta/Google/CAPI.
 */

const asArray = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export async function draftTexts(): Promise<QuizTexts> {
  const row = await db.setting.findUnique({ where: { key: "quiz_texts_draft" } });
  const saved = row?.value && typeof row.value === "object" && !Array.isArray(row.value) ? (row.value as Partial<QuizTexts>) : {};
  return { ...QUIZ_TEXT_DEFAULTS, ...saved };
}

/** Monta o quiz a partir do rascunho (admin: edição e pré-visualização). */
export async function buildDraftQuiz(): Promise<QuizData> {
  const [questions, results, texts] = await Promise.all([
    db.quizQuestion.findMany({ where: { active: true }, include: { options: { orderBy: [{ sortOrder: "asc" }] } }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    db.quizResult.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }] }),
    draftTexts(),
  ]);
  return {
    questions: questions
      .filter((q) => q.options.length > 0)
      .map((q) => ({
        id: q.id,
        title: q.title,
        helpText: q.helpText,
        type: q.type === "multiple" ? "multiple" : "single",
        required: q.required,
        options: q.options.map((o) => ({ id: o.id, label: o.label, resultKey: o.resultKey, weight: o.weight, nextQuestionId: o.nextQuestionId })),
      })),
    results: results.map((r) => ({ key: r.key, title: r.title, subtitle: r.subtitle, body: r.body, points: asArray<string>(r.points).filter(Boolean), reflection: r.reflection, exercise: r.exercise, ctaLabel: r.ctaLabel, ctaTarget: r.ctaTarget })),
    texts,
  };
}

/** Problemas que impedem publicar (o site nunca recebe um quiz quebrado). */
export function validateQuiz(q: QuizData): string[] {
  const errors: string[] = [];
  if (!q.questions.length) errors.push("Cadastre pelo menos uma pergunta ativa com opções.");
  const qIds = new Set(q.questions.map((x) => x.id));
  const rKeys = new Set(q.results.map((r) => r.key));
  if (!q.results.length) errors.push("Cadastre pelo menos um resultado editorial ativo.");
  if (q.texts.fallbackResultKey && !rKeys.has(q.texts.fallbackResultKey)) errors.push(`O resultado padrão "${q.texts.fallbackResultKey}" não existe ou está inativo.`);
  for (const question of q.questions) {
    for (const o of question.options) {
      if (o.resultKey && !rKeys.has(o.resultKey)) errors.push(`A opção "${o.label}" aponta para o resultado "${o.resultKey}", que não existe ou está inativo.`);
      if (o.nextQuestionId && o.nextQuestionId !== "END" && !qIds.has(o.nextQuestionId)) errors.push(`A opção "${o.label}" leva a uma pergunta inativa ou excluída.`);
      if (o.nextQuestionId === question.id) errors.push(`A opção "${o.label}" leva para a própria pergunta.`);
    }
  }
  return errors;
}

export async function publishQuiz(adminId: string) {
  const data = await buildDraftQuiz();
  const errors = validateQuiz(data);
  if (errors.length) return { ok: false as const, errors };
  const v = await db.quizVersion.create({ data: { data: data as unknown as Prisma.InputJsonValue, publishedBy: adminId } });
  return { ok: true as const, version: v };
}

async function loadPublished() {
  const v = await db.quizVersion.findFirst({ orderBy: { publishedAt: "desc" } });
  return v ? { id: v.id, publishedAt: v.publishedAt.toISOString(), data: v.data as unknown as QuizData } : null;
}

const cachedPublished = unstable_cache(loadPublished, ["quiz-published-v1"], { tags: ["quiz"], revalidate: 300 });

/** Última versão publicada (cache invalidado ao publicar). */
export async function getPublishedQuiz() {
  try {
    return await cachedPublished();
  } catch {
    return loadPublished().catch(() => null);
  }
}

// ───────────────────────── Sessões (leads) ─────────────────────────

export type QuizContext = {
  visitorId?: string | null;
  trackingSessionId?: string | null;
  userAgent?: string | null;
  host?: string | null;
  attribution?: { last?: { source?: string | null; medium?: string | null; campaign?: string | null; content?: string | null; term?: string | null } | null; first?: { source?: string | null; medium?: string | null; campaign?: string | null; content?: string | null; term?: string | null } | null; fbclid?: string | null; gclid?: string | null; ttclid?: string | null; referrer?: string | null } | null;
};

const cut = (v: string | null | undefined, n = 200) => (v ? String(v).slice(0, n) : null);

/** Início (ou retomada) da sessão — só com consentimento para tratar as respostas. */
export async function startQuizSession(id: string, versionId: string, ctx: QuizContext) {
  const existing = await db.quizSession.findUnique({ where: { id } });
  if (existing) {
    await db.quizSession.update({ where: { id }, data: { lastInteractionAt: new Date(), consentAt: existing.consentAt ?? new Date() } });
    return existing;
  }
  const a = ctx.attribution ?? {};
  const touch = a.last ?? a.first ?? null;
  const ua = parseUserAgent(ctx.userAgent ?? null);
  return db.quizSession.create({
    data: {
      id,
      quizVersionId: versionId,
      visitorId: cut(ctx.visitorId, 64),
      trackingSessionId: cut(ctx.trackingSessionId, 64),
      consentAt: new Date(),
      utmSource: cut(touch?.source),
      utmMedium: cut(touch?.medium),
      utmCampaign: cut(touch?.campaign),
      utmContent: cut(touch?.content),
      utmTerm: cut(touch?.term),
      channel: classifyChannel({ source: touch?.source, medium: touch?.medium, fbclid: a.fbclid, gclid: a.gclid, ttclid: a.ttclid, referrer: a.referrer, siteHost: ctx.host ?? null }),
      device: ua.device,
    },
  });
}

/** Grava uma resposta validada contra a versão publicada da sessão (opções precisam pertencer à pergunta). */
export async function saveQuizAnswer(sessionId: string, data: QuizData, questionId: string, optionIds: string[]) {
  const session = await db.quizSession.findUnique({ where: { id: sessionId } });
  if (!session || !session.consentAt) throw new Error("Sessão inválida.");
  if (session.completedAt) return session;
  const q = data.questions.find((x) => x.id === questionId);
  if (!q) throw new Error("Pergunta inválida.");
  const chosen = q.options.filter((o) => optionIds.includes(o.id));
  if (!chosen.length || (q.type === "single" && chosen.length > 1)) throw new Error("Escolha uma opção válida.");
  await db.quizAnswer.upsert({
    where: { sessionId_questionId: { sessionId, questionId } },
    update: { optionIds: chosen.map((o) => o.id), optionLabels: chosen.map((o) => o.label), questionTitle: q.title, answeredAt: new Date() },
    create: { sessionId, questionId, questionTitle: q.title, optionIds: chosen.map((o) => o.id), optionLabels: chosen.map((o) => o.label) },
  });
  const steps = await db.quizAnswer.count({ where: { sessionId } });
  return db.quizSession.update({ where: { id: sessionId }, data: { stepsCompleted: steps, currentQuestionId: questionId, lastInteractionAt: new Date() } });
}

export async function saveQuizLead(sessionId: string, lead: { name: string; email: string; marketingConsent: boolean }) {
  const session = await db.quizSession.findUnique({ where: { id: sessionId } });
  if (!session || !session.consentAt) throw new Error("Sessão inválida.");
  return db.quizSession.update({
    where: { id: sessionId },
    data: { name: lead.name.slice(0, 120), email: lead.email.toLowerCase().slice(0, 160), marketingConsent: lead.marketingConsent, identifiedAt: session.identifiedAt ?? new Date(), lastInteractionAt: new Date() },
  });
}

/** Conclui: calcula o resultado editorial no servidor a partir das respostas gravadas. */
export async function completeQuiz(sessionId: string, data: QuizData) {
  const { computeResult } = await import("@/lib/quiz");
  const session = await db.quizSession.findUnique({ where: { id: sessionId }, include: { answers: true } });
  if (!session || !session.consentAt) throw new Error("Sessão inválida.");
  const answers = Object.fromEntries(session.answers.map((a) => [a.questionId, asArray<string>(a.optionIds)]));
  const resultKey = computeResult(data, answers);
  if (!session.completedAt || session.resultKey !== resultKey) {
    await db.quizSession.update({ where: { id: sessionId }, data: { completedAt: session.completedAt ?? new Date(), resultKey, lastInteractionAt: new Date() } });
  }
  return { resultKey, firstTime: !session.completedAt };
}

export async function markQuizStage(sessionId: string, stage: "offer" | "checkout") {
  const data = stage === "offer" ? { offerViewedAt: new Date() } : { checkoutStartedAt: new Date() };
  const field = stage === "offer" ? "offerViewedAt" : "checkoutStartedAt";
  await db.quizSession.updateMany({ where: { id: sessionId, [field]: null }, data: { ...data, lastInteractionAt: new Date() } });
}

export async function linkQuizToOrder(sessionId: string | null | undefined, orderId: string) {
  if (!sessionId) return;
  // Liga ao pedido mais recente enquanto não houver compra (PIX abandonado e refeito não perde o vínculo)
  await db.quizSession.updateMany({ where: { id: sessionId, purchasedAt: null }, data: { orderId, checkoutStartedAt: new Date(), lastInteractionAt: new Date() } });
}

export async function markQuizPurchased(orderId: string) {
  await db.quizSession.updateMany({ where: { orderId, purchasedAt: null }, data: { purchasedAt: new Date() } });
}

/** Exclusão total de um lead (pedido da titular ou decisão do admin). */
export async function deleteQuizSession(sessionId: string) {
  await db.quizSession.delete({ where: { id: sessionId } }).catch(() => null);
}

/**
 * Retenção (LGPD): após N dias, apaga as respostas de todas as sessões e anonimiza nome/e-mail
 * de quem não comprou. Pedidos e métricas agregadas são preservados.
 */
export async function applyQuizRetention(days: number) {
  if (!Number.isFinite(days) || days < 1) return { answers: 0, anonymized: 0 };
  const before = new Date(Date.now() - days * 86_400_000);
  const answers = await db.quizAnswer.deleteMany({ where: { session: { lastInteractionAt: { lt: before } } } });
  const anonymized = await db.quizSession.updateMany({
    where: { lastInteractionAt: { lt: before }, orderId: null, anonymizedAt: null, OR: [{ email: { not: null } }, { name: { not: null } }] },
    data: { name: null, email: null, anonymizedAt: new Date() },
  });
  if (answers.count || anonymized.count) log.info("quiz", "retenção aplicada", { answers: answers.count, anonymized: anonymized.count, days });
  return { answers: answers.count, anonymized: anonymized.count };
}
