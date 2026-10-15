/**
 * Rotinas de manutenção executadas pelo /api/cron/[job] (protegido por CRON_SECRET)
 * e pelos scripts locais. Sem "server-only" para poderem rodar via tsx.
 */
import { PrismaClient } from "@prisma/client";
import { decodeEnvHash } from "@/lib/auth/hash";

type AnyDelegate = { createMany: (a: object) => Promise<{ count: number }>; count: () => Promise<number> };

/** Ordem respeita as chaves estrangeiras. Sessões admin e tentativas de login não são copiadas. */
const MODELS = [
  "adminUser",
  "auditLog",
  "product",
  "priceHistory",
  "customer",
  "coupon",
  "order",
  "orderItem",
  "payment",
  "paymentEvent",
  "webhookEvent",
  "digitalAccess",
  "orderBump",
  "upsell",
  "upsellEvent",
  "analyticsSession",
  "analyticsEvent",
  "adSpend",
  "experiment",
  "landingSection",
  "galleryItem",
  "faq",
  "review",
  "setting",
  "messageTemplate",
] as const;

const stripNulls = (row: Record<string, unknown>) => Object.fromEntries(Object.entries(row).filter(([, v]) => v !== null));

/**
 * Copia todos os dados de LEGACY_DATABASE_URL para o banco atual (DATABASE_URL).
 * Só roda se o banco atual estiver vazio (sem produtos), a menos que force=true.
 * Idempotente: registros já existentes são ignorados (skipDuplicates).
 */
export async function migrateFromLegacy(target: PrismaClient, legacyUrl: string | undefined, force = false) {
  if (!legacyUrl) throw new Error("LEGACY_DATABASE_URL não configurada");
  const already = await target.product.count();
  if (already > 0 && !force) return { skipped: true, reason: `banco atual já tem ${already} produtos` };

  const legacy = new PrismaClient({ datasourceUrl: legacyUrl });
  const copied: Record<string, number> = {};
  try {
    for (const model of MODELS) {
      const dst = (target as unknown as Record<string, AnyDelegate>)[model];
      // SQL puro no banco antigo: tolera colunas que ainda não existiam lá (schema mais antigo)
      const table = model.charAt(0).toUpperCase() + model.slice(1);
      let rows = await legacy.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT * FROM "${table}"`);
      // Pedidos principais antes dos complementares (autorrelação parentOrderId)
      if (model === "order") rows = [...rows.filter((r) => !r.parentOrderId), ...rows.filter((r) => r.parentOrderId)];
      let count = 0;
      for (let i = 0; i < rows.length; i += 500) {
        const res = await dst.createMany({ data: rows.slice(i, i + 500).map(stripNulls), skipDuplicates: true });
        count += res.count;
      }
      copied[model] = count;
    }
    // Sequência do campo Order.seq (autoincrement) alinhada aos registros copiados
    await target.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('"Order"', 'seq'), GREATEST(COALESCE((SELECT MAX(seq) FROM "Order"), 1), 1))`);
  } finally {
    await legacy.$disconnect();
  }
  return { skipped: false, copied };
}

/** Define a senha do administrador ADMIN_EMAIL a partir de ADMIN_PASSWORD_HASH (recuperação de acesso). */
export async function resetAdminFromEnv(target: PrismaClient) {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const hash = decodeEnvHash(process.env.ADMIN_PASSWORD_HASH);
  if (!email || !hash) throw new Error("ADMIN_EMAIL/ADMIN_PASSWORD_HASH ausentes");
  const admin = await target.adminUser.upsert({
    where: { email },
    update: { passwordHash: hash, active: true, role: "OWNER" },
    create: { email, name: "Administrador", passwordHash: hash, role: "OWNER" },
  });
  await target.adminSession.deleteMany({ where: { adminId: admin.id } });
  await target.loginAttempt.deleteMany({ where: { key: `email:${email}` } });
  await target.auditLog.create({ data: { action: "admin_password_reset", entity: "adminUser", entityId: admin.id, summary: `Senha de ${email} redefinida via variável de ambiente` } });
  return { email, reset: true };
}
