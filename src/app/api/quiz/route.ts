import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp, isSameOrigin } from "@/lib/request";
import { log } from "@/lib/log";
import { clientContextSchema } from "@/lib/validation";
import { sendQuizResultEmail } from "@/lib/email";
import { completeQuiz, getPublishedQuiz, markQuizStage, saveQuizAnswer, saveQuizLead, startQuizSession } from "@/server/quiz";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const sid = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/);
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), sessionId: sid, consent: z.literal(true), context: clientContextSchema.optional() }),
  z.object({ action: z.literal("answer"), sessionId: sid, questionId: z.string().min(1).max(40), optionIds: z.array(z.string().min(1).max(40)).min(1).max(12) }),
  z.object({ action: z.literal("lead"), sessionId: sid, name: z.string().trim().min(2, "Informe seu nome").max(120), email: z.string().trim().toLowerCase().email("E-mail inválido").max(160), marketingConsent: z.boolean().default(false) }),
  z.object({ action: z.literal("complete"), sessionId: sid }),
  z.object({ action: z.literal("offer_view"), sessionId: sid }),
  z.object({ action: z.literal("checkout_started"), sessionId: sid }),
]);

/**
 * Quiz (somente versão publicada). As respostas são gravadas apenas após o consentimento específico
 * e nunca são encaminhadas a plataformas de anúncio. O resultado é calculado no servidor.
 */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
  const ip = getClientIp(req.headers);
  if (!rateLimit(`quiz:${ip}`, 90, 10 * 60_000)) return NextResponse.json({ error: "Muitas tentativas. Aguarde alguns minutos." }, { status: 429 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos.", field: parsed.error.issues[0]?.path.join(".") }, { status: 422 });
  const body = parsed.data;

  try {
    if (body.action === "offer_view" || body.action === "checkout_started") {
      await markQuizStage(body.sessionId, body.action === "offer_view" ? "offer" : "checkout");
      return NextResponse.json({ ok: true });
    }
    const published = await getPublishedQuiz();
    if (!published) return NextResponse.json({ error: "O quiz não está disponível no momento." }, { status: 503 });

    if (body.action === "start") {
      const s = await startQuizSession(body.sessionId, published.id, {
        visitorId: req.cookies.get("adf_vid")?.value ?? body.context?.visitorId ?? null,
        trackingSessionId: body.context?.sessionId ?? null,
        userAgent: req.headers.get("user-agent"),
        host: req.headers.get("x-forwarded-host") ?? req.headers.get("host"),
        attribution: body.context?.attribution ?? null,
      });
      return NextResponse.json({ ok: true, versionId: s.quizVersionId });
    }

    // Sessões usam a versão em que começaram (o admin pode publicar outra no meio)
    const session = await db.quizSession.findUnique({ where: { id: body.sessionId }, select: { quizVersionId: true } });
    if (!session) return NextResponse.json({ error: "Sessão não encontrada. Recarregue a página." }, { status: 404 });
    const version = session.quizVersionId && session.quizVersionId !== published.id ? await db.quizVersion.findUnique({ where: { id: session.quizVersionId } }) : null;
    const data = version ? (version.data as unknown as typeof published.data) : published.data;

    if (body.action === "answer") {
      await saveQuizAnswer(body.sessionId, data, body.questionId, body.optionIds);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "lead") {
      await saveQuizLead(body.sessionId, { name: body.name, email: body.email, marketingConsent: body.marketingConsent });
      return NextResponse.json({ ok: true });
    }
    // complete
    const { resultKey, firstTime } = await completeQuiz(body.sessionId, data);
    const result = data.results.find((r) => r.key === resultKey) ?? null;
    if (firstTime && result) {
      const s = await db.quizSession.findUnique({ where: { id: body.sessionId }, select: { email: true, name: true } });
      if (s?.email) {
        await sendQuizResultEmail(s.email, {
          firstName: s.name?.split(/\s+/)[0] ?? null,
          title: result.title,
          body: result.body,
          points: result.points,
          disclaimer: data.texts.resultDisclaimer,
          ctaLabel: result.ctaLabel || "Conhecer o Além da Fome",
          ctaTarget: result.ctaTarget && result.ctaTarget !== "/" ? result.ctaTarget : "/e-book",
        }).catch(() => null);
      }
    }
    return NextResponse.json({ ok: true, resultKey });
  } catch (err) {
    const message = err instanceof Error ? err.message : "erro";
    log.warn("quiz", "falha na ação", { action: body.action, error: message });
    return NextResponse.json({ error: message.length < 120 ? message : "Não foi possível salvar agora. Tente novamente." }, { status: 400 });
  }
}
