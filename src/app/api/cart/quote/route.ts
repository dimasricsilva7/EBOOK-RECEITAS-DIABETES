import { NextResponse, type NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp, isSameOrigin } from "@/lib/request";
import { quoteSchema } from "@/lib/validation";
import { publicQuote, quoteCart } from "@/server/cart";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";

/** Orçamento do carrinho calculado no servidor (preços, bumps, cross-sell, cupom, frete). */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
  const ip = getClientIp(req.headers);
  if (!rateLimit(`quote:${ip}`, 90, 60_000)) return NextResponse.json({ error: "Muitas requisições." }, { status: 429 });

  const parsed = quoteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Carrinho inválido." }, { status: 400 });
  try {
    const quote = await quoteCart({ ...parsed.data, visitorId: req.cookies.get("adf_vid")?.value });
    return NextResponse.json(publicQuote(quote), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    log.error("cart", "erro ao calcular carrinho", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Não foi possível atualizar o carrinho." }, { status: 500 });
  }
}
