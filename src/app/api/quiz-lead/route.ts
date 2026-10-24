import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getClientIp, isSameOrigin } from "@/lib/request";
import { rateLimit } from "@/lib/rate-limit";
import { hashIp } from "@/lib/crypto";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

/** Lead do quiz: salva no painel (Admin → Suporte). Simples e prático — sem envio automático. */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
  const ip = getClientIp(req.headers);
  if (!rateLimit(`quizlead:${ip}`, 10, 10 * 60_000)) return NextResponse.json({ error: "Muitas tentativas." }, { status: 429 });

  const body = (await req.json().catch(() => null)) as { email?: string; respostas?: { pergunta?: string; resposta?: string | null }[] } | null;
  const email = String(body?.email ?? "").trim().toLowerCase().slice(0, 160);
  if (!emailOk(email)) return NextResponse.json({ error: "E-mail inválido." }, { status: 400 });
  const respostas = Array.isArray(body?.respostas) ? body!.respostas!.slice(0, 10) : [];
  const resumo = respostas.map((r, i) => `${i + 1}. ${r?.pergunta ?? ""} → ${r?.resposta ?? "—"}`).join("\n");

  await db.supportMessage
    .create({ data: { name: email.split("@")[0].slice(0, 80), email, subject: "Lead do quiz", message: resumo || "(sem respostas)", status: "OPEN", ipHash: hashIp(ip) } })
    .catch((e) => log.error("quiz-lead", "falha ao salvar lead", { error: e instanceof Error ? e.message : String(e) }));

  return NextResponse.json({ ok: true });
}
