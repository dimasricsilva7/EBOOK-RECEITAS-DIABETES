/**
 * Testes unitários das regras críticas (sem banco): preço, cupom, testes A/B,
 * assinatura de webhook, transições de status, validações e logs.
 *   npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { computeTotals, couponDiscount, effectivePrice, isPromoActive, formatOrderNumber } from "../src/lib/pricing";
import { assignVariant, priceOverrides, fnv1a } from "../src/lib/experiments";
import { verifyWebhookSignature, signWebhookPayload, buildPixBody, statusFromEvent } from "../src/lib/payments/bravopay";
import { canTransition } from "../src/lib/order-status";
import { isValidCpf, isValidPhone } from "../src/utils/validators";
import { classifyChannel, parseUserAgent } from "../src/utils/channel";
import { hexToChannels } from "../src/lib/theme";
import { redact } from "../src/lib/log";

const product = { id: "p1", priceCents: 11990, compareAtPriceCents: null, promoPriceCents: null, promoStartsAt: null, promoEndsAt: null };

test("preço: sem promoção usa o preço do banco", () => {
  const p = effectivePrice(product);
  assert.equal(p.priceCents, 11990);
  assert.equal(p.listPriceCents, null);
});

test("preço: 'de' só aparece quando maior que o preço atual", () => {
  assert.equal(effectivePrice({ ...product, compareAtPriceCents: 14990 }).listPriceCents, 14990);
  assert.equal(effectivePrice({ ...product, compareAtPriceCents: 9990 }).listPriceCents, null);
});

test("promoção vale somente dentro da janela configurada", () => {
  const now = new Date("2026-10-10T12:00:00Z");
  const promo = { ...product, promoPriceCents: 9990, promoStartsAt: new Date("2026-10-01T00:00:00Z"), promoEndsAt: new Date("2026-10-12T00:00:00Z") };
  assert.equal(isPromoActive(promo, now), true);
  assert.equal(effectivePrice(promo, {}, now).priceCents, 9990);
  assert.equal(effectivePrice(promo, {}, now).listPriceCents, 11990);
  assert.equal(effectivePrice(promo, {}, new Date("2026-10-12T00:00:01Z")).priceCents, 11990);
  assert.equal(isPromoActive({ ...promo, promoEndsAt: null }, now), false, "sem data final não há promoção (sem contagem falsa)");
});

test("teste A/B de preço sobrescreve o preço base", () => {
  assert.equal(effectivePrice(product, { p1: 10990 }).priceCents, 10990);
  assert.deepEqual(priceOverrides([{ experimentKey: "x", target: "price:p1", variantKey: "b", value: "10990" }]), { p1: 10990 });
  assert.deepEqual(priceOverrides([{ experimentKey: "x", target: "price:p1", variantKey: "b", value: "100" }]), {}, "abaixo do mínimo do PIX é ignorado");
});

test("cupom percentual e fixo, restrito a produtos e com mínimo", () => {
  const lines = [
    { productId: "kit", unitPriceCents: 7990, quantity: 1 },
    { productId: "lib", unitPriceCents: 1990, quantity: 1 },
  ];
  assert.equal(couponDiscount(lines, { type: "PERCENT", value: 10, minSubtotalCents: null, productIds: [] }), 998);
  assert.equal(couponDiscount(lines, { type: "PERCENT", value: 10, minSubtotalCents: null, productIds: ["kit"] }), 799);
  assert.equal(couponDiscount(lines, { type: "FIXED", value: 50000, minSubtotalCents: null, productIds: ["lib"] }), 1990, "nunca maior que as linhas elegíveis");
  assert.equal(couponDiscount(lines, { type: "FIXED", value: 1000, minSubtotalCents: 20000, productIds: [] }), 0, "mínimo não atingido");
});

test("totais: desconto nunca deixa o total negativo", () => {
  assert.deepEqual(computeTotals([{ productId: "a", unitPriceCents: 6700, quantity: 1 }, { productId: "b", unitPriceCents: 1900, quantity: 1 }], 500), { subtotalCents: 8600, discountCents: 500, totalCents: 8100 });
  assert.equal(computeTotals([{ productId: "a", unitPriceCents: 1000, quantity: 1 }], 5000).totalCents, 0);
  assert.equal(formatOrderNumber(2026, 27684), "DM27684-2026");
});

test("A/B: atribuição determinística e respeita os pesos", () => {
  const exp = { key: "hero", target: "hero_headline", variants: [{ key: "a", weight: 50, value: "" }, { key: "b", weight: 50, value: "B" }] };
  assert.equal(assignVariant("visitor-123", exp)?.key, assignVariant("visitor-123", exp)?.key);
  const counts = { a: 0, b: 0 } as Record<string, number>;
  for (let i = 0; i < 4000; i++) counts[assignVariant(`v${i}`, exp)!.key]++;
  assert.ok(Math.abs(counts.a - 2000) < 200, `distribuição ~50/50 (${counts.a}/${counts.b})`);
  assert.equal(assignVariant("x", { ...exp, variants: [{ key: "a", weight: 0, value: "" }, { key: "b", weight: 100, value: "" }] })?.key, "b");
  assert.equal(fnv1a("abc"), fnv1a("abc"));
});

test("webhook: assinatura HMAC-SHA256 válida, inválida e antiga (anti-replay)", () => {
  const secret = "whsec_test";
  const body = JSON.stringify({ id: "evt_1", type: "transaction.paid", data: { id: "tx_1" } });
  const header = signWebhookPayload(body, secret);
  assert.equal(verifyWebhookSignature(body, header, secret), true);
  assert.equal(verifyWebhookSignature(body + " ", header, secret), false, "corpo alterado");
  assert.equal(verifyWebhookSignature(body, header, "outro"), false, "segredo errado");
  assert.equal(verifyWebhookSignature(body, null, secret), false, "sem assinatura");
  assert.equal(verifyWebhookSignature(body, header, undefined), false, "sem segredo configurado");
  const old = Math.floor(Date.now() / 1000) - 3600;
  assert.equal(verifyWebhookSignature(body, signWebhookPayload(body, secret, old), secret), false, "timestamp antigo");
  const manual = `t=${Math.floor(Date.now() / 1000)},v1=${crypto.createHmac("sha256", secret).update(`${Math.floor(Date.now() / 1000)}.${body}`).digest("hex")}`;
  assert.equal(verifyWebhookSignature(body, manual, secret), true, "formato documentado t=,v1=");
});

test("webhook: tipo do evento define o status", () => {
  const ev = (type: string) => ({ id: "e", type, created: 0, data: { id: "t", status: "PENDING" as const, amount_cents: 1 } });
  assert.equal(statusFromEvent(ev("transaction.paid")), "PAID");
  assert.equal(statusFromEvent(ev("transaction.refunded")), "REFUNDED");
  assert.equal(statusFromEvent(ev("transaction.chargeback")), "CHARGEBACK");
  assert.equal(statusFromEvent(ev("transaction.expired")), "EXPIRED");
  assert.equal(statusFromEvent(ev("transaction.failed")), "FAILED");
});

test("payload PIX segue a documentação (centavos, limites, UTMs)", () => {
  const body = buildPixBody({
    amountCents: 13980,
    idempotencyKey: "k",
    externalReference: "HB-2026-00001",
    description: "x".repeat(400),
    customer: { name: "Ana Souza", email: "a@b.com", cpf: "529.982.247-25", phone: "(11) 98765-4321" },
    metadata: { order_id: "o1", empty: "" },
    utm: { source: "facebook", campaign: "test", fbclid: "abc" },
    expiresInSeconds: 30,
  });
  assert.equal(body.amount_cents, 13980);
  assert.equal(body.method, "pix");
  assert.equal(body.description.length, 300);
  assert.equal(body.expires_in, 60, "mínimo de 60s");
  assert.equal(body.customer.cpf, "52998224725");
  assert.equal(body.customer.phone, "11987654321");
  assert.deepEqual(body.metadata, { order_id: "o1" });
  assert.deepEqual(body.utm, { source: "facebook", campaign: "test", fbclid: "abc" });
});

test("status: pedido pago não volta para pendente/expirado", () => {
  assert.equal(canTransition("PIX_GENERATED", "PAID"), true);
  assert.equal(canTransition("EXPIRED", "PAID"), true, "pagamento tardio");
  assert.equal(canTransition("PAID", "EXPIRED"), false);
  assert.equal(canTransition("PAID", "PAID"), false, "idempotente");
  assert.equal(canTransition("PAID", "REFUNDED"), true);
  assert.equal(canTransition("CREDIARIO_APROVADO", "REFUNDED"), true);
  assert.equal(canTransition("PIX_GENERATED", "REFUNDED"), false);
  assert.equal(canTransition("REFUNDED", "CHARGEBACK"), true);
});

test("validações de CPF e telefone", () => {
  assert.equal(isValidCpf("529.982.247-25"), true);
  assert.equal(isValidCpf("111.111.111-11"), false);
  assert.equal(isValidPhone("11987654321"), true);
  assert.equal(isValidPhone("123"), false);
});

test("origem do tráfego e dispositivo", () => {
  assert.equal(classifyChannel({ source: "facebook" }), "facebook");
  assert.equal(classifyChannel({ fbclid: "x" }), "facebook");
  assert.equal(classifyChannel({ ttclid: "x" }), "tiktok");
  assert.equal(classifyChannel({ referrer: "https://www.google.com/" }), "organico");
  assert.equal(parseUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Mobile Safari").device, "mobile");
  assert.equal(parseUserAgent("Mozilla/5.0 HeadlessChrome/120").isBot, true);
});

test("tema e logs", () => {
  assert.equal(hexToChannels("#2F4BFF"), "47 75 255");
  assert.equal(hexToChannels("javascript:alert(1)"), null, "valores inválidos são ignorados (sem injeção de CSS)");
  assert.deepEqual(redact({ order: "HB-1", cpf: "123", nested: { phone: "11", ok: 1 } }), { order: "HB-1", cpf: "[redacted]", nested: { phone: "[redacted]", ok: 1 } });
});
