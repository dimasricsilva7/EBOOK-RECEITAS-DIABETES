import "dotenv/config";
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
(async () => {
  const all = await db.product.findMany({ select: { id: true, name: true } });
  const byId = new Map(all.map((p) => [p.id, p.name]));
  const offers = await db.product.findMany({ where: { category: "PROGRAM" }, orderBy: { sortOrder: "asc" } });
  for (const o of offers) {
    const inc = (o.includedProductIds as string[]).map((id) => byId.get(id) ?? "?");
    const de = o.compareAtPriceCents ? " (de " + (o.compareAtPriceCents / 100).toFixed(2) + ")" : "";
    console.log((o.featured ? "* " : "  ") + o.name + " = R$" + (o.priceCents / 100).toFixed(2) + de + " | img=" + o.imageUrl);
    console.log("     inclui: " + inc.join(" | "));
  }
  const bumps = await db.orderBump.findMany({ orderBy: { sortOrder: "asc" } });
  console.log("BUMPS: " + bumps.map((b) => (b.active ? "ON " : "off ") + b.title + " R$" + ((b.priceCents ?? 0) / 100).toFixed(2)).join(" | "));
  const ups = await db.upsell.findMany({ orderBy: { sortOrder: "asc" } });
  console.log("UPSELLS: " + ups.map((u) => (u.active ? "ON " : "off ") + u.title).join(" | "));
  const ds = await db.downsell.findMany({ include: { upsell: true } });
  console.log("DOWNSELL: " + ds.map((d) => d.title + " <= recusa de [" + d.upsell.title + "]").join(" | "));
  await db.$disconnect();
})();
