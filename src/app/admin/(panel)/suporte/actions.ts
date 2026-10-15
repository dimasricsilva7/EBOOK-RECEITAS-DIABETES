"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { withAdminVoid } from "@/server/admin/guard";
import { str } from "@/server/admin/forms";

export async function toggleSupportStatus(fd: FormData) {
  await withAdminVoid("EDITOR", async () => {
    const m = await db.supportMessage.findUniqueOrThrow({ where: { id: str(fd, "id", 40) } });
    const open = m.status !== "OPEN";
    await db.supportMessage.update({ where: { id: m.id }, data: { status: open ? "OPEN" : "RESOLVED", resolvedAt: open ? null : new Date() } });
    revalidatePath("/admin/suporte");
  });
}
