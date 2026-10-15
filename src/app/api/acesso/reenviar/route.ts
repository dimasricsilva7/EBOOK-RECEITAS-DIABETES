import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp, isSameOrigin } from "@/lib/request";
import { isProductionDeploy } from "@/lib/env";
import { isScriptClient } from "@/lib/security";
import { requestAccessResend } from "@/lib/email";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";

const schema = z.object({ email: z.string().trim().toLowerCase().email().max(160) });

/**
 * "Recuperar meu acesso": envia o link dos pedidos PAGOS para o e-mail informado.
 * A resposta é sempre a mesma (não revela se o e-mail tem compras); o link só chega à caixa da compradora.
 */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
  if (isProductionDeploy() && isScriptClient(req.headers.get("user-agent"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const ip = getClientIp(req.headers);
  if (!rateLimit(`resend:${ip}`, 5, 15 * 60_000)) return NextResponse.json({ error: "Muitas tentativas. Aguarde alguns minutos." }, { status: 429 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Informe um e-mail válido." }, { status: 422 });
  if (!rateLimit(`resend-email:${parsed.data.email}`, 3, 60 * 60_000)) return NextResponse.json({ ok: true });

  const r = await requestAccessResend(parsed.data.email).catch((e) => {
    log.error("access", "falha ao reenviar acesso", { error: e instanceof Error ? e.message : String(e) });
    return { sent: 0, disabled: false };
  });
  if (r.disabled) return NextResponse.json({ error: "O envio de e-mails ainda não está configurado. Fale com o suporte." }, { status: 503 });
  return NextResponse.json({ ok: true });
}
