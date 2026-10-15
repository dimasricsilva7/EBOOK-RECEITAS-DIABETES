import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashIp } from "@/lib/crypto";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp, isSameOrigin } from "@/lib/request";
import { isProductionDeploy } from "@/lib/env";
import { isScriptClient, looksLikeBotSubmission } from "@/lib/security";
import { sendSupportEmails } from "@/lib/email";

export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().trim().min(2, "Informe seu nome").max(120),
  email: z.string().trim().toLowerCase().email("E-mail inválido").max(160),
  orderNumber: z.string().trim().toUpperCase().max(40).optional().nullable(),
  subject: z.string().trim().min(3, "Informe o assunto").max(140),
  message: z.string().trim().min(10, "Conte um pouco mais (mínimo 10 caracteres)").max(4000),
  hp: z.string().max(200).optional(),
  elapsedMs: z.number().int().min(0).max(86_400_000).optional(),
});

/** Formulário de suporte: grava a mensagem (Admin → Suporte) e avisa o atendimento por e-mail, se configurado. */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
  if (isProductionDeploy() && isScriptClient(req.headers.get("user-agent"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const ip = getClientIp(req.headers);
  if (!rateLimit(`support:${ip}`, 5, 30 * 60_000)) return NextResponse.json({ error: "Muitas mensagens seguidas. Aguarde um pouco." }, { status: 429 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Confira os dados.", field: parsed.error.issues[0]?.path[0] }, { status: 422 });
  if (looksLikeBotSubmission({ hp: parsed.data.hp, elapsedMs: parsed.data.elapsedMs })) return NextResponse.json({ ok: true });

  const { hp: _hp, elapsedMs: _e, ...data } = parsed.data;
  const m = await db.supportMessage.create({ data: { ...data, orderNumber: data.orderNumber || null, ipHash: hashIp(ip) } });
  const r = await sendSupportEmails({ id: m.id, ...data, orderNumber: data.orderNumber || null }).catch((e) => ({ ok: false as const, error: e instanceof Error ? e.message : "erro" }));
  await db.supportMessage.update({ where: { id: m.id }, data: r.ok ? { emailSentAt: new Date() } : { emailError: r.error.slice(0, 300) } });
  return NextResponse.json({ ok: true });
}
