import { NextResponse } from "next/server";
import { runTick } from "@/server/jobs";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Agendador externo (cron-job.org, UptimeRobot…): GET https://SEU-DOMINIO/api/tick a cada 1–5 min. */
export async function GET() {
  try {
    const r = await runTick();
    if ("skipped" in r) return NextResponse.json({ ok: true, skipped: true }, { headers: { "Cache-Control": "no-store" } });
    const e = r.emails as { sent?: number; leads?: { sent: number } } | { skipped: true };
    return NextResponse.json({ ok: true, emailsSent: "sent" in e ? e.sent : 0, leadEmailsSent: "leads" in e ? e.leads?.sent ?? 0 : 0 }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    log.error("cron", "tick falhou", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
export const HEAD = GET;
