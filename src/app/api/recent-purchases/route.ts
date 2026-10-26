import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { PAID_STATUSES } from "@/lib/domain";

export const dynamic = "force-dynamic";

function timeAgo(at: Date | null): string {
  if (!at) return "há pouco";
  const min = Math.floor((Date.now() - at.getTime()) / 60000);
  if (min < 1) return "agora mesmo";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return `há ${d} dia${d > 1 ? "s" : ""}`;
}

/** Balões de compra: compras REAIS pagas + notificações cadastradas no admin (prova social). */
export async function GET() {
  try {
    const [notices, orders] = await Promise.all([
      db.purchaseNotice.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }], take: 40 }),
      db.order.findMany({
        where: { status: { in: [...PAID_STATUSES] }, source: "STOREFRONT", paidAt: { not: null } },
        orderBy: { paidAt: "desc" },
        take: 15,
        select: { paidAt: true, customerSnapshot: true, items: { where: { kind: "PRODUCT" }, select: { productName: true }, take: 1 } },
      }),
    ]);
    const real = orders
      .map((o) => {
        const snap = o.customerSnapshot as { name?: string } | null;
        const first = (snap?.name ?? "").trim().split(/\s+/)[0] ?? "";
        if (!first) return null;
        return { name: first, product: o.items[0]?.productName ?? "um kit", when: timeAgo(o.paidAt) };
      })
      .filter((x): x is { name: string; product: string; when: string } => Boolean(x));
    const manual = notices.map((n) => ({ name: n.name, product: n.product, when: n.timeLabel || "há pouco" }));
    // Compras reais primeiro; depois as cadastradas. O componente alterna entre elas.
    return NextResponse.json({ purchases: [...real, ...manual] });
  } catch {
    return NextResponse.json({ purchases: [] });
  }
}
