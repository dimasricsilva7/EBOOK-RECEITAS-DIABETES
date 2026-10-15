"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { withAdmin, type ActionResult } from "@/server/admin/guard";
import { str } from "@/server/admin/forms";
import { deleteQuizSession } from "@/server/quiz";

/** Exclusão total de um lead (direito de eliminação — LGPD). Registra na auditoria sem guardar os dados apagados. */
export async function deleteLeadAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return withAdmin("ADMIN", async (admin) => {
    const id = str(fd, "id", 64);
    if (str(fd, "confirm", 20).toUpperCase() !== "EXCLUIR") return { error: 'Digite "EXCLUIR" para confirmar.' };
    const s = await db.quizSession.findUnique({ where: { id }, select: { id: true, email: true } });
    if (!s) return { error: "Lead não encontrado." };
    await deleteQuizSession(id);
    await audit(admin.id, "lead_deleted", "quizSession", id, { summary: `Lead excluído (dados do quiz apagados)${s.email ? " · e-mail informado" : ""}` });
    redirect("/admin/leads");
  });
}
