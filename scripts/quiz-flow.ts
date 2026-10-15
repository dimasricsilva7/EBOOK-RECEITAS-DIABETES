/**
 * Fluxo visual do quiz no navegador: abertura em "/", voltar preservando a resposta, captura opcional
 * (pular), resultado e página do e-book. Gera capturas e falha se houver rolagem horizontal ou erro no console.
 *   npx tsx scripts/quiz-flow.ts http://localhost:3217 screenshots/v2
 */
import { chromium, type Page } from "playwright";
import { mkdirSync } from "fs";
import assert from "node:assert/strict";

const base = process.argv[2] ?? "http://localhost:3000";
const out = process.argv[3] ?? "screenshots/quiz-flow";

async function noOverflow(page: Page, label: string) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(over <= 1, `${label}: rolagem horizontal de ${over}px`);
}

(async () => {
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  for (const w of [390, 1440]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: w < 800 ? 844 : 900 }, isMobile: w < 800, hasTouch: w < 800 });
    await ctx.addCookies([{ name: "adf_consent", value: "denied", url: base }]);
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

    await page.goto(`${base}/?utm_source=teste&utm_campaign=fluxo`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: /O que a comida representa/ }).waitFor();
    await page.screenshot({ path: `${out}/${w}-1-intro.png`, fullPage: true });
    await noOverflow(page, "intro");

    await page.getByRole("button", { name: /Começar meu quiz/ }).click();
    assert.ok(await page.getByText("Para começar, confirme").isVisible(), "validação do consentimento");
    await page.locator('input[type="checkbox"]').first().check();
    await page.getByRole("button", { name: /Começar meu quiz/ }).click();

    // Pergunta 1 → escolhe a 2ª opção, volta e confere que a escolha foi preservada
    const opts = () => page.locator('[role="radiogroup"] [role="radio"]');
    await opts().nth(1).click();
    await page.getByRole("heading", { name: /Olhando para esses momentos/ }).waitFor();
    await page.screenshot({ path: `${out}/${w}-2-pergunta.png`, fullPage: true });
    await page.getByRole("button", { name: "Voltar" }).click();
    await page.getByRole("heading", { name: /Em quais momentos/ }).waitFor();
    await page.waitForFunction(() => document.querySelectorAll('[role="radio"]')[1]?.getAttribute("aria-checked") === "true", null, { timeout: 3000 }).catch(() => assert.fail("voltar preserva a resposta"));
    await opts().nth(1).click();
    for (let i = 0; i < 4; i++) {
      await page.waitForTimeout(450);
      await opts().nth(i === 3 ? 1 : 0).click();
    }
    await page.getByRole("heading", { name: /Quer receber/ }).waitFor();
    await page.screenshot({ path: `${out}/${w}-3-lead.png`, fullPage: true });
    await page.getByRole("button", { name: /Ver meu resultado sem informar e-mail/ }).click();
    await page.getByRole("heading", { name: /Um exercício/ }).waitFor();
    await page.screenshot({ path: `${out}/${w}-4-resultado.png`, fullPage: true });
    await noOverflow(page, "resultado");
    const href = await page.locator('[data-cta="quiz_result_cta"]').getAttribute("href");
    assert.ok(href?.startsWith("/e-book") && href.includes("utm_source=teste"), `CTA do resultado leva ao e-book com UTM: ${href}`);

    await page.locator('[data-cta="quiz_result_cta"]').click();
    await page.waitForURL(/\/e-book/);
    await page.locator("#oferta").waitFor({ timeout: 30000 });
    await page.waitForLoadState("networkidle");
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 500) {
        window.scrollTo({ top: y, behavior: "instant" });
        await new Promise((r) => setTimeout(r, 120));
      }
      window.scrollTo({ top: 0, behavior: "instant" });
      await new Promise((r) => setTimeout(r, 800));
    });
    await page.screenshot({ path: `${out}/${w}-5-ebook.png`, fullPage: true });
    await noOverflow(page, "e-book");
    assert.equal(await page.locator("#como-funciona").count(), 1, "âncora #como-funciona");
    assert.equal(await page.locator("#autora").count(), 1, "âncora #autora");
    assert.equal(await page.locator("#oferta").count(), 1, "âncora #oferta");
    const cfg = errors.filter((e) => !/Failed to load resource.*(fbevents|gtag)/.test(e));
    assert.deepEqual(cfg, [], `erros no console (${w}px): ${cfg.join(" | ")}`);
    console.log(`✔ ${w}px: intro, validação, voltar preserva resposta, captura opcional, resultado, CTA com UTM, /e-book sem rolagem horizontal`);
    await ctx.close();
  }
  await browser.close();
})().catch((e) => {
  console.error("✘", e instanceof Error ? e.message : e);
  process.exit(1);
});
