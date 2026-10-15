import { NextResponse, type NextRequest } from "next/server";
import type { EmailType } from "@prisma/client";
import { getCurrentAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { EMAIL_TYPE_LABEL, renderEmail, renderPreview, type PreviewKind } from "@/lib/email";
import { getSettingsFresh } from "@/server/settings";

export const dynamic = "force-dynamic";

const KIND_BY_TYPE: Record<string, PreviewKind> = { ORDER_CREATED: "order", PURCHASE_CONFIRMATION: "confirmation", PIX_RECOVERY: "recovery", ACCESS_RESEND: "access" };
const KINDS: PreviewKind[] = ["order", "confirmation", "upsell", "recovery", "access", "checkout", "quiz"];

/**
 * Prévia dos e-mails no admin.
 *   ?order=<id>&type=<EmailType>  → e-mail real daquele pedido
 *   ?kind=order|confirmation|upsell|recovery|access|checkout|quiz → exemplo com dados fictícios e os textos atuais
 */
export async function GET(req: NextRequest) {
  if (!(await getCurrentAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const s = await getSettingsFresh();
  const type = (sp.get("type") ?? "PURCHASE_CONFIRMATION") as EmailType;
  const orderId = sp.get("order");

  let email: { subject: string; html: string };
  if (orderId && type in EMAIL_TYPE_LABEL) {
    const order = await db.order.findUnique({ where: { id: orderId }, include: { customer: true, items: { include: { product: { select: { digitalDeliveryNote: true } } } }, crediario: { select: { methodLabel: true, installmentLabel: true } } } });
    if (!order) return NextResponse.json({ error: "pedido não encontrado" }, { status: 404 });
    email = renderEmail(type, order, s);
  } else {
    const k = sp.get("kind") as PreviewKind | null;
    email = await renderPreview(k && KINDS.includes(k) ? k : (KIND_BY_TYPE[type] ?? "confirmation"), s);
  }
  const banner = `<div style="font-family:system-ui;background:#3B2A22;color:#fff;padding:8px 12px;font-size:13px">Prévia · Assunto: <b>${email.subject.replace(/</g, "&lt;")}</b></div>`;
  return new NextResponse(banner + email.html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
