import { NextResponse, type NextRequest } from "next/server";
import { checkoutSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp, isSameOrigin } from "@/lib/request";
import { bravopayMode } from "@/lib/env";
import { log } from "@/lib/log";
import { CheckoutError, createCheckoutOrder } from "@/server/orders";
import { isProductionDeploy } from "@/lib/env";
import { isScriptClient, looksLikeBotSubmission } from "@/lib/security";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
  if (isProductionDeploy() && isScriptClient(req.headers.get("user-agent"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const ip = getClientIp(req.headers);
  if (!rateLimit(`checkout:${ip}`, 10, 10 * 60_000)) {
    return NextResponse.json({ error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." }, { status: 429 });
  }
  const parsed = checkoutSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const fields = Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message]));
    return NextResponse.json({ error: "Confira os dados informados.", fields }, { status: 422 });
  }
  // Robô: campo isca preenchido ou formulário enviado rápido demais — resposta genérica, nada é criado
  if (looksLikeBotSubmission({ hp: parsed.data.hp, elapsedMs: parsed.data.elapsedMs })) {
    log.warn("checkout", "envio bloqueado (sinais de robô)", { ip: ip.replace(/\.\d+$/, ".x") });
    return NextResponse.json({ error: "Não foi possível concluir. Recarregue a página e tente novamente." }, { status: 422 });
  }
  // Sem gateway configurado não criamos pedidos PIX que nunca poderiam ser pagos (crediário não depende do gateway).
  if (parsed.data.paymentMethod !== "CREDIARIO" && bravopayMode() === "disabled") {
    log.error("checkout", "BravoPay não configurada (BRAVOPAY_API_KEY ausente)");
    return NextResponse.json({ error: "Pagamentos temporariamente indisponíveis. Tente novamente em alguns minutos." }, { status: 503 });
  }
  // Visitor ID do cookie tem prioridade: é ele que define as variantes de preço dos testes A/B
  const vid = req.cookies.get("adf_vid")?.value;
  const input = vid ? { ...parsed.data, context: { ...parsed.data.context, visitorId: vid } } : parsed.data;

  try {
    const { order } = await createCheckoutOrder(input, { ip, userAgent: req.headers.get("user-agent"), host: req.headers.get("x-forwarded-host") ?? req.headers.get("host") });
    return NextResponse.json({ orderNumber: order.orderNumber, token: order.accessToken, status: order.status, hasPix: Boolean(order.pixCopyPaste), totalCents: order.totalCents, metaEventId: order.metaEventId });
  } catch (err) {
    if (err instanceof CheckoutError) return NextResponse.json({ error: err.message, fields: err.fields }, { status: err.status });
    log.error("checkout", "erro inesperado", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Não conseguimos gerar o PIX agora. Tente novamente." }, { status: 500 });
  }
}
