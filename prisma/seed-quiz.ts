import type { PrismaClient } from "@prisma/client";
import { QUIZ_TEXT_DEFAULTS, type QuizData } from "../src/lib/quiz";

/** Mesma montagem de src/server/quiz.ts (buildDraftQuiz), sem "server-only", para o seed. */
export async function buildDraftQuizFrom(db: PrismaClient): Promise<QuizData> {
  const [questions, results, saved] = await Promise.all([
    db.quizQuestion.findMany({ where: { active: true }, include: { options: { orderBy: { sortOrder: "asc" } } }, orderBy: [{ sortOrder: "asc" }] }),
    db.quizResult.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }] }),
    db.setting.findUnique({ where: { key: "quiz_texts_draft" } }),
  ]);
  const texts = saved?.value && typeof saved.value === "object" && !Array.isArray(saved.value) ? (saved.value as Partial<QuizData["texts"]>) : {};
  return {
    questions: questions.map((q) => ({ id: q.id, title: q.title, helpText: q.helpText, type: q.type === "multiple" ? "multiple" : "single", required: q.required, options: q.options.map((o) => ({ id: o.id, label: o.label, resultKey: o.resultKey, weight: o.weight, nextQuestionId: o.nextQuestionId })) })),
    results: results.map((r) => ({ key: r.key, title: r.title, subtitle: r.subtitle, body: r.body, points: Array.isArray(r.points) ? (r.points as string[]) : [], reflection: r.reflection, exercise: r.exercise, ctaLabel: r.ctaLabel, ctaTarget: r.ctaTarget })),
    texts: { ...QUIZ_TEXT_DEFAULTS, ...texts },
  };
}
