import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const WINDOW_MS = 15_000; // batimento a cada ~7 s → online = visto nos últimos 15 s

function pageLabel(raw: string | null, method?: string) {
  const path = raw?.split("?")[0] ?? null;
  if (!path || path === "/") return "Página inicial";
  if (path.startsWith("/checkout")) return "Checkout";
  if (path.startsWith("/pedido")) return method === "CREDIARIO" ? "Página do pedido (Crediário)" : method === "PIX" ? "Página do pedido (PIX)" : "Página do pedido";
  if (path.startsWith("/produto")) return "Página de produto";
  return path;
}

export async function GET() {
  if (!(await getCurrentAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sessions = await db.analyticsSession.findMany({
    where: { lastSeenAt: { gte: new Date(Date.now() - WINDOW_MS) }, NOT: { device: "servidor" } },
    select: { id: true, exitPage: true, device: true, utmSource: true, channel: true },
    take: 1000,
  });
  // Quem está na página do pedido: descobre PIX ou Crediário pelo pedido mais recente da sessão
  const pedidoSids = sessions.filter((s) => s.exitPage?.startsWith("/pedido")).map((s) => s.id);
  const methodBySid = new Map<string, string>();
  if (pedidoSids.length) {
    const orders = await db.order.findMany({ where: { sessionId: { in: pedidoSids } }, select: { sessionId: true, paymentMethod: true }, orderBy: { createdAt: "desc" } });
    for (const o of orders) if (o.sessionId && !methodBySid.has(o.sessionId)) methodBySid.set(o.sessionId, o.paymentMethod);
  }
  const count = <T extends { id: string }>(items: T[], key: (s: T) => string) => {
    const m = new Map<string, number>();
    for (const s of items) m.set(key(s), (m.get(key(s)) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, n]) => ({ label, n }));
  };
  return NextResponse.json(
    {
      online: sessions.length,
      pages: count(sessions, (s) => pageLabel(s.exitPage, methodBySid.get(s.id))),
      sources: count(sessions, (s) => s.utmSource ?? s.channel ?? "direto"),
      devices: count(sessions, (s) => s.device ?? "desconhecido"),
      at: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
