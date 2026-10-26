import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { PAID_STATUSES } from "@/lib/domain";

export const dynamic = "force-dynamic";

/** Compras REAIS recentes (apenas pedidos pagos). Só primeiro nome + kit — nada de dado sensível. */
export async function GET() {
  try {
    const orders = await db.order.findMany({
      where: { status: { in: [...PAID_STATUSES] }, source: "STOREFRONT", paidAt: { not: null } },
      orderBy: { paidAt: "desc" },
      take: 15,
      select: { paidAt: true, customerSnapshot: true, items: { where: { kind: "PRODUCT" }, select: { productName: true }, take: 1 } },
    });
    const purchases = orders
      .map((o) => {
        const snap = o.customerSnapshot as { name?: string } | null;
        const first = (snap?.name ?? "").trim().split(/\s+/)[0] ?? "";
        if (!first) return null;
        return { name: first, product: o.items[0]?.productName ?? "um kit", at: o.paidAt?.toISOString() ?? null };
      })
      .filter(Boolean);
    return NextResponse.json({ purchases });
  } catch {
    return NextResponse.json({ purchases: [] });
  }
}
