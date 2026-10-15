import "server-only";

export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}

export const isProductionDeploy = () =>
  process.env.VERCEL_ENV === "production" || (process.env.NODE_ENV === "production" && !process.env.VERCEL_ENV);

/**
 * Modo da BravoPay:
 * - live: BRAVOPAY_API_KEY definida
 * - mock: BRAVOPAY_MODE=mock (PIX fictício para testar o fluxo) — bloqueado em produção
 * - disabled: sem chave → checkout responde 503 (não cria pedidos impagáveis)
 */
export function bravopayMode(): "live" | "mock" | "disabled" {
  if (process.env.BRAVOPAY_MODE === "mock") return isProductionDeploy() ? "disabled" : "mock";
  return process.env.BRAVOPAY_API_KEY ? "live" : "disabled";
}

export type EnvCheck = { key: string; ok: boolean; required: boolean; hint: string };

/** Diagnóstico exibido no admin (nunca expõe valores, apenas presença). */
export function envHealth(): EnvCheck[] {
  const has = (k: string) => Boolean(process.env[k]);
  return [
    { key: "DATABASE_URL", ok: has("DATABASE_URL"), required: true, hint: "Postgres (Neon) — conexão pooled" },
    { key: "DATABASE_URL_UNPOOLED", ok: has("DATABASE_URL_UNPOOLED"), required: true, hint: "Postgres — conexão direta (migrations)" },
    { key: "NEXT_PUBLIC_SITE_URL", ok: has("NEXT_PUBLIC_SITE_URL"), required: true, hint: "URL pública do site (sem barra final)" },
    { key: "AUTH_SECRET", ok: has("AUTH_SECRET"), required: true, hint: "Segredo para hashes/assinaturas (32+ bytes)" },
    { key: "BRAVOPAY_API_KEY", ok: has("BRAVOPAY_API_KEY") || bravopayMode() === "mock", required: true, hint: "Chave da API BravoPay (bp_live_...)" },
    { key: "BRAVOPAY_WEBHOOK_SECRET", ok: has("BRAVOPAY_WEBHOOK_SECRET"), required: true, hint: "Segredo do webhook BravoPay" },
    { key: "BRAVOPAY_PRODUCT_ID", ok: has("BRAVOPAY_PRODUCT_ID"), required: false, hint: "ID do produto BravoPay (atribuição UTMify)" },
    { key: "CRON_SECRET", ok: has("CRON_SECRET"), required: true, hint: "Protege os endpoints de jobs" },
    { key: "DATA_ENCRYPTION_KEY", ok: has("DATA_ENCRYPTION_KEY"), required: false, hint: "Chave AES-256 dos dados do crediário (64 hex). Recomendada; sem ela usa AUTH_SECRET" },
    { key: "RESEND_API_KEY", ok: has("RESEND_API_KEY"), required: true, hint: "Resend — e-mails de pedido, acesso e lembrete de PIX" },
    { key: "EMAIL_FROM", ok: has("EMAIL_FROM"), required: true, hint: "Remetente, ex.: Além da Fome <acesso@seudominio.com.br>" },
    { key: "ADMIN_EMAIL", ok: has("ADMIN_EMAIL"), required: false, hint: "Bootstrap do primeiro admin" },
    { key: "META_CAPI_TOKENS", ok: has("META_CAPI_TOKENS") || has("META_ACCESS_TOKEN"), required: false, hint: "Meta Conversions API — pixelId:token por pixel (ou META_ACCESS_TOKEN)" },
  ];
}
