"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { formatBRL } from "@/utils/format";
import { withAdmin, withAdminVoid, type ActionResult } from "@/server/admin/guard";
import { optStr, parseMoney, str } from "@/server/admin/forms";

export async function addSpend(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return withAdmin("ADMIN", async (admin) => {
  const date = str(fd, "date", 10);
  const spend = parseMoney(fd.get("spend"));
  const source = str(fd, "source", 60).toLowerCase();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || spend == null || !source) return { error: "Informe data, origem e valor." };
  const row = await db.adSpend.create({ data: { date: new Date(date), source, campaign: optStr(fd, "campaign", 200), adset: optStr(fd, "adset", 200), ad: optStr(fd, "ad", 200), spendCents: spend } });
  await audit(admin.id, "ad_spend_created", "adSpend", row.id, { summary: `Custo ${formatBRL(spend)} em ${date} (${source})` });
  revalidatePath("/admin/custos");
  return { ok: true, message: "Custo registrado." };
  });
}

/** Importação em lote: uma linha por registro → data;origem;campanha;conjunto;anúncio;valor */
export async function importSpend(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return withAdmin("ADMIN", async (admin) => {
  const lines = str(fd, "csv", 50_000).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rows = [];
  for (const [i, line] of lines.entries()) {
    const [date, source, campaign, adset, ad, value] = line.split(/[;\t]/).map((x) => x?.trim() ?? "");
    const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date);
    const iso = br ? `${br[3]}-${br[2]}-${br[1]}` : date;
    const cents = parseMoney(value ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !source || cents == null) return { error: `Linha ${i + 1} inválida: "${line.slice(0, 80)}"` };
    rows.push({ date: new Date(iso), source: source.toLowerCase(), campaign: campaign || null, adset: adset || null, ad: ad || null, spendCents: cents });
  }
  if (!rows.length) return { error: "Nada para importar." };
  await db.adSpend.createMany({ data: rows });
  await audit(admin.id, "ad_spend_imported", "adSpend", null, { summary: `${rows.length} custos importados` });
  revalidatePath("/admin/custos");
  return { ok: true, message: `${rows.length} registro(s) importado(s).` };
  });
}

export async function deleteSpend(fd: FormData): Promise<void> {
  return withAdminVoid("ADMIN", async (admin) => {
  const id = str(fd, "id", 40);
  const row = await db.adSpend.delete({ where: { id } });
  await audit(admin.id, "ad_spend_deleted", "adSpend", id, { summary: `Custo removido: ${formatBRL(row.spendCents)} (${row.source})` });
  revalidatePath("/admin/custos");
  });
}
