/**
 * Teste ponta a ponta do funil (SOMENTE com BRAVOPAY_MODE=mock — nunca contra produção com a BravoPay real).
 *   npx tsx scripts/e2e-funnel.ts http://localhost:3100
 * Cobre: quiz (início, respostas, lead, resultado) → checkout (cálculo no servidor, idempotência, bump inválido)
 * → acesso bloqueado antes do pagamento → webhook assinado (e duplicado) → acesso liberado
 * (oferta única E-book R$ 67, Completo recusado) → Purchase só com pagamento → lead ligado ao pedido → upsell gera NOVO pedido → reembolso revoga.
 */
import "dotenv/config";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const BASE = process.argv[2] ?? "http://localhost:3100";
const db = new PrismaClient();
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const H = { "Content-Type": "application/json", Origin: BASE, "User-Agent": UA };
const rid = (n = 24) => crypto.randomBytes(n).toString("base64url").slice(0, n);
const post = async (path: string, body: unknown) => {
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers: H, body: JSON.stringify(body) });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
};
let ok = 0;
const step = (name: string) => {
  console.log(`✔ ${name}`);
  ok++;
};

function sign(body: string) {
  const t = Math.floor(Date.now() / 1000);
  return `t=${t},v1=${crypto.createHmac("sha256", process.env.BRAVOPAY_WEBHOOK_SECRET!).update(`${t}.${body}`).digest("hex")}`;
}
async function webhookPaid(orderId: string) {
  const o = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  const body = JSON.stringify({ id: `evt_e2e_${o.id}`, type: "transaction.paid", created: Math.floor(Date.now() / 1000), data: { id: o.transactionId, status: "PAID", method: "PIX", amount_cents: o.totalCents, external_reference: o.externalReference, paid_at: new Date().toISOString() } });
  const send = () => fetch(`${BASE}/api/webhooks/bravopay`, { method: "POST", headers: { "Content-Type": "application/json", "bravopay-signature": sign(body) }, body });
  return { first: await send(), second: await send() };
}

async function main() {
  assert.equal(process.env.BRAVOPAY_MODE, "mock", "Rode apenas com BRAVOPAY_MODE=mock");
  const [ebook, completo] = await Promise.all([db.product.findUniqueOrThrow({ where: { slug: "alem-da-fome-ebook" } }), db.product.findUniqueOrThrow({ where: { slug: "alem-da-fome-completo" } })]);

  // Limpa resíduos de execuções interrompidas
  await db.upsell.deleteMany({ where: { name: "[E2E] Upsell" } });
  await db.digitalMaterial.deleteMany({ where: { title: { startsWith: "[E2E]" } } });

  // Preparação: vendas fechadas e sem material → checkout recusa
  await db.setting.upsert({ where: { key: "sales_enabled" }, update: { value: "false" }, create: { key: "sales_enabled", value: "false" } });
  const closed = await post("/api/checkout", { checkoutToken: rid(32), customer: { name: "Teste Fechado", email: "fechado@example.com", phone: "11987654321", cpf: "52998224725" }, items: [{ productId: ebook.id, quantity: 1 }], elapsedMs: 9000 });
  assert.equal(closed.status, 503);
  step("vendas fechadas → checkout recusado");

  await db.setting.update({ where: { key: "sales_enabled" }, data: { value: "true" } });
  const noMat = await post("/api/checkout", { checkoutToken: rid(32), customer: { name: "Teste Sem Material", email: "semmat@example.com", phone: "11987654321", cpf: "52998224725" }, items: [{ productId: ebook.id, quantity: 1 }], elapsedMs: 9000 });
  assert.equal(noMat.status, 409, "produto sem material pronto não pode ser vendido");
  step("produto sem material PRONTO → checkout recusado (não vende conteúdo inexistente)");

  // Materiais de teste (links) — marcados como [E2E] e removidos ao final
  const m1 = await db.digitalMaterial.create({ data: { productId: ebook.id, title: "[E2E] E-book", format: "LINK", source: "link", externalUrl: "https://example.com/ebook-e2e", status: "READY", showOnLanding: false } });
  const m2 = await db.digitalMaterial.create({ data: { productId: completo.id, title: "[E2E] Curso", format: "LINK", source: "link", externalUrl: "https://example.com/curso-e2e", status: "READY", showOnLanding: false } });

  // Entrada do site = quiz; página de vendas em /e-book só com a oferta única de R$ 67
  const home = await (await fetch(`${BASE}/`, { headers: { "User-Agent": UA } })).text();
  assert.ok(home.includes("O que a comida representa") && !home.includes("Além da Fome Completo"), "/ abre o quiz");
  assert.equal((await fetch(`${BASE}/quiz`, { headers: { "User-Agent": UA } })).status, 200, "/quiz continua funcionando");
  const sales = await (await fetch(`${BASE}/e-book`, { headers: { "User-Agent": UA } })).text();
  assert.ok(/67,00/.test(sales) && !sales.includes("Além da Fome Completo") && !/97,00/.test(sales), "/e-book mostra só o E-book de R$ 67");
  assert.ok(!sales.includes("Geneen Roth") && !sales.includes("confirmação na hora"), "autoria não confirmada não é publicada; sem PIX na hora");
  assert.ok(sales.includes("Um ciclo que vale a pena observar") && sales.includes("Tudo o que você precisa saber"), "seções novas presentes");
  assert.equal(completo.active, false, "plano Completo desativado");
  const oldOffer = await post("/api/checkout", { checkoutToken: rid(32), customer: { name: "Teste Completo", email: "completo@example.com", phone: "11987654321", cpf: "52998224725" }, items: [{ productId: completo.id, quantity: 1 }], elapsedMs: 9000 });
  assert.notEqual(oldOffer.status, 200, "oferta Completo não pode ser comprada por rotas antigas");
  step(`rotas: / = quiz, /quiz ok, /e-book só R$ 67; Completo recusado no checkout (${oldOffer.status})`);

  // Quiz
  const quiz = await db.quizVersion.findFirstOrThrow({ orderBy: { publishedAt: "desc" } });
  const data = quiz.data as { questions: { id: string; options: { id: string }[] }[] };
  const sid = rid(32);
  assert.equal((await post("/api/quiz", { action: "answer", sessionId: sid, questionId: data.questions[0].id, optionIds: [data.questions[0].options[0].id] })).status, 404, "sem consentimento não grava");
  assert.equal((await post("/api/quiz", { action: "start", sessionId: sid, consent: true, context: { attribution: { last: { source: "facebook", campaign: "e2e" } } } })).status, 200);
  for (const q of data.questions) assert.equal((await post("/api/quiz", { action: "answer", sessionId: sid, questionId: q.id, optionIds: [q.options[0].id] })).status, 200);
  assert.equal((await post("/api/quiz", { action: "answer", sessionId: sid, questionId: data.questions[0].id, optionIds: ["opcao-falsa"] })).status, 400, "opção inválida recusada");
  assert.equal((await post("/api/quiz", { action: "lead", sessionId: sid, name: "Maria Teste", email: "maria.e2e@example.com", marketingConsent: false })).status, 200);
  const done = await post("/api/quiz", { action: "complete", sessionId: sid });
  assert.equal(done.status, 200);
  assert.equal(done.json.resultKey, "estresse");
  const qs = await db.quizSession.findUniqueOrThrow({ where: { id: sid }, include: { answers: true } });
  assert.equal(qs.answers.length, data.questions.length);
  assert.ok(qs.identifiedAt && qs.completedAt && qs.utmSource === "facebook");
  step(`quiz: consentimento, ${data.questions.length} respostas, lead, resultado "${done.json.resultKey}" calculado no servidor`);
  await post("/api/quiz", { action: "offer_view", sessionId: sid });

  // Checkout da oferta única (E-book R$ 67)
  const token = rid(32);
  const body = { checkoutToken: token, customer: { name: "Maria Teste", email: "maria.e2e@example.com", phone: "11987654321", cpf: "52998224725" }, items: [{ productId: ebook.id, quantity: 3 }], quizSessionId: sid, elapsedMs: 9000, context: { attribution: { last: { source: "facebook", campaign: "e2e" } } } };
  const badBump = await post("/api/checkout", { ...body, checkoutToken: rid(32), bumpIds: ["bump_inexistente"] });
  assert.equal(badBump.status, 200, "bump inexistente é simplesmente ignorado (o servidor só cobra o que existe e está ativo)");
  const c1 = await post("/api/checkout", body);
  assert.equal(c1.status, 200, JSON.stringify(c1.json));
  assert.equal(c1.json.totalCents, 6700, "quantidade de produto digital é sempre 1 — total recalculado no servidor");
  const c2 = await post("/api/checkout", body);
  assert.equal(c2.json.orderNumber, c1.json.orderNumber, "idempotência: mesmo checkoutToken → mesmo pedido");
  const robot = await post("/api/checkout", { ...body, checkoutToken: rid(32), hp: "spam" });
  assert.equal(robot.status, 422, "honeypot bloqueia robôs");
  step(`checkout: pedido ${c1.json.orderNumber} R$ 67,00, PIX gerado, idempotente, honeypot ativo`);

  const order = await db.order.findUniqueOrThrow({ where: { orderNumber: String(c1.json.orderNumber) }, include: { items: { include: { digitalAccess: true } } } });
  assert.equal(order.status, "PIX_GENERATED");
  assert.equal(order.items.flatMap((i) => i.digitalAccess).length, 0, "nenhum acesso antes do pagamento");
  const pubBefore = await (await fetch(`${BASE}/api/orders/status?pedido=${order.orderNumber}&t=${order.accessToken}`, { headers: { "User-Agent": UA } })).json();
  assert.equal(pubBefore.metaEventId === null || pubBefore.digital.length === 0, true);
  assert.equal(pubBefore.digital.length, 0);
  step("antes do pagamento: sem acesso e sem materiais na página do pedido");

  // Webhook assinado (duas vezes → idempotente)
  const wh = await webhookPaid(order.id);
  assert.equal(wh.first.status, 200);
  assert.equal(wh.second.status, 200);
  const invalid = await fetch(`${BASE}/api/webhooks/bravopay`, { method: "POST", headers: { "Content-Type": "application/json", "bravopay-signature": "t=1,v1=00" }, body: "{}" });
  assert.equal(invalid.status, 401, "assinatura inválida recusada");
  const paid = await db.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: { include: { digitalAccess: true } }, emailEvents: true } });
  assert.equal(paid.status, "PAID");
  assert.ok(paid.deliveredAt && paid.purchaseTrackedAt);
  assert.equal((await db.analyticsEvent.count({ where: { orderId: order.id, name: "purchase" } })), 1, "Purchase registrado uma única vez");
  step("webhook assinado: pedido PAGO uma única vez (duplicado ignorado, assinatura inválida recusada)");

  const pub = await (await fetch(`${BASE}/api/orders/status?pedido=${order.orderNumber}&t=${order.accessToken}`, { headers: { "User-Agent": UA } })).json();
  const titles = pub.digital.flatMap((d: { materials: { title: string }[] }) => d.materials.map((m) => m.title));
  assert.ok(titles.includes("[E2E] E-book") && !titles.includes("[E2E] Curso"), `E-book entrega só o e-book: ${titles}`);
  assert.ok(pub.metaEventId, "event_id de Purchase disponível só após pagamento");
  const href = pub.digital[0].materials.find((m: { title: string }) => m.title === "[E2E] E-book").href;
  const dl = await fetch(`${BASE}${href}`, { redirect: "manual", headers: { "User-Agent": UA } });
  assert.equal(dl.status, 302);
  assert.equal(dl.headers.get("location"), "https://example.com/ebook-e2e");
  const fake = await fetch(`${BASE}/api/acesso/${"x".repeat(32)}/${m1.id}`, { headers: { "User-Agent": UA } });
  assert.equal(fake.status, 404, "token inválido não acessa");
  step("acesso liberado: material do E-book; token inválido bloqueado");

  const lead = await db.quizSession.findUniqueOrThrow({ where: { id: sid } });
  assert.equal(lead.orderId, order.id);
  assert.ok(lead.purchasedAt && lead.offerViewedAt && lead.checkoutStartedAt);
  step("lead do quiz ligado ao pedido (oferta vista, checkout, compra)");
  assert.ok(paid.emailEvents.some((e) => e.type === "PURCHASE_CONFIRMATION"), "e-mail de acesso registrado");
  step(`e-mails registrados: ${[...new Set(paid.emailEvents.map((e) => `${e.type}:${e.status}`))].join(", ")}`);

  // Upsell: aceitar gera NOVO pedido PIX (não cobra nada sem novo pagamento)
  const upProduct = await db.product.upsert({ where: { slug: "e2e-upsell" }, update: { active: true }, create: { slug: "e2e-upsell", sku: "E2E-UP", name: "[E2E] Upsell", category: "BONUS", priceCents: 2700, active: true } });
  const upMat = await db.digitalMaterial.create({ data: { productId: upProduct.id, title: "[E2E] Bônus", format: "LINK", source: "link", externalUrl: "https://example.com/bonus", status: "READY" } });
  const up = await db.upsell.create({ data: { name: "[E2E] Upsell", productId: upProduct.id, headline: "Teste", title: "Teste", active: true } });
  const acc = await post("/api/upsell", { pedido: order.orderNumber, t: order.accessToken, upsellId: up.id, action: "accept" });
  assert.equal(acc.status, 200, JSON.stringify(acc.json));
  const child = await db.order.findUniqueOrThrow({ where: { orderNumber: String(acc.json.orderNumber) } });
  assert.equal(child.source, "UPSELL");
  assert.equal(child.status, "PIX_GENERATED", "upsell aceito NÃO é compra: aguarda novo PIX");
  assert.equal(child.totalCents, 2700);
  step(`upsell aceito → novo pedido ${child.orderNumber} aguardando PIX (sem cobrança automática)`);

  // Reembolso revoga o acesso
  const refundBody = JSON.stringify({ id: `evt_e2e_refund_${order.id}`, type: "transaction.refunded", created: Math.floor(Date.now() / 1000), data: { id: paid.transactionId, status: "REFUNDED", amount_cents: paid.totalCents, external_reference: paid.externalReference } });
  await fetch(`${BASE}/api/webhooks/bravopay`, { method: "POST", headers: { "Content-Type": "application/json", "bravopay-signature": sign(refundBody) }, body: refundBody });
  const after = await fetch(`${BASE}${href}`, { redirect: "manual", headers: { "User-Agent": UA } });
  assert.notEqual(after.status, 302, "reembolso revoga o acesso");
  step("reembolso (webhook) → acesso revogado");

  // Limpeza do que é só de teste
  await db.upsell.delete({ where: { id: up.id } });
  await db.digitalMaterial.deleteMany({ where: { id: { in: [m1.id, m2.id, upMat.id] } } });
  await db.product.update({ where: { id: upProduct.id }, data: { active: false } });
  await db.setting.update({ where: { key: "sales_enabled" }, data: { value: "false" } });
  console.log(`\n${ok} verificações OK.`);
}

main()
  .catch((e) => {
    console.error("✘", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
