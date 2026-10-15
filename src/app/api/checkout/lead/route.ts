import { NextResponse, type NextRequest } from "next/server";
import { checkoutLeadSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp, isSameOrigin } from "@/lib/request";
import { findLeadByToken, logLeadError, upsertCheckoutLead } from "@/server/checkout-leads";

export const dynamic = "force-dynamic";

/** Salva o contato digitado no checkout (para recuperar a compra se a pessoa sair). */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "origem" }, { status: 403 });
  if (!rateLimit(`lead:${getClientIp(req.headers)}`, 30, 10 * 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const parsed = checkoutLeadSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 422 });
  try {
    const lead = await upsertCheckoutLead(parsed.data, { userAgent: req.headers.get("user-agent"), visitorId: req.cookies.get("adf_vid")?.value });
    return NextResponse.json({ ok: true, saved: Boolean(lead) });
  } catch (err) {
    logLeadError("falha ao salvar lead", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

/** Link do e-mail de checkout abandonado: devolve carrinho e contato para restaurar. */
export async function GET(req: NextRequest) {
  if (!rateLimit(`lead-get:${getClientIp(req.headers)}`, 20, 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const lead = await findLeadByToken(req.nextUrl.searchParams.get("token"));
  if (!lead) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(
    { clientKey: lead.clientKey, name: lead.name, email: lead.email, phone: lead.phone, items: lead.items, bumpIds: lead.bumpIds ?? [], couponCode: lead.couponCode },
    { headers: { "Cache-Control": "no-store" } }
  );
}
