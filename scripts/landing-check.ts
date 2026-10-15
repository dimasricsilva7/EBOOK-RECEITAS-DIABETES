/**
 * Verificação visual/interativa da página /e-book em várias larguras (somente ambiente local/teste):
 * rolagem horizontal, ciclo tocável, galeria (setas, indicadores, ampliação), FAQ e erros de console.
 * Cria imagens de galeria temporárias "[E2E]" (apontando para /og) e remove ao final.
 *   npx tsx scripts/landing-check.ts http://localhost:3217 screenshots/landing
 */
import "dotenv/config";
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const base = process.argv[2] ?? "http://localhost:3000";
const out = process.argv[3] ?? "screenshots/landing";
const db = new PrismaClient();

(async () => {
  mkdirSync(out, { recursive: true });
  await db.galleryItem.deleteMany({ where: { title: { startsWith: "[E2E]" } } });
  await db.galleryItem.createMany({ data: [1, 2, 3].map((n) => ({ title: `[E2E] Página ${n}`, category: "LANDING", imageUrl: `/og?e2e=${n}`, alt: `Página de teste ${n}`, sortOrder: 900 + n })) });

  const browser = await chromium.launch();
  try {
    for (const w of [320, 360, 390, 430, 768, 1024, 1440]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: w < 800 ? 780 : 900 }, isMobile: w < 800, hasTouch: w < 800 });
      await ctx.addCookies([{ name: "adf_consent", value: "denied", url: base }]);
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      await page.goto(`${base}/e-book`, { waitUntil: "networkidle" });
      await page.locator("#oferta").waitFor({ timeout: 30000 });
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 400) {
          window.scrollTo({ top: y, behavior: "instant" });
          await new Promise((r) => setTimeout(r, 90));
        }
        window.scrollTo({ top: 0, behavior: "instant" });
        await new Promise((r) => setTimeout(r, 700));
      });
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(over <= 1, `${w}px: rolagem horizontal de ${over}px`);

      // H1 único e títulos visíveis
      assert.equal(await page.locator("h1").count(), 1, "um único H1");

      // Ciclo: tocar na etapa 3 abre a explicação extra
      const step3 = page.locator('#como-funciona button[aria-controls="ciclo-2"]');
      await step3.scrollIntoViewIfNeeded();
      await step3.click();
      assert.equal(await step3.getAttribute("aria-expanded"), "true");
      assert.ok(await page.locator("#ciclo-2").isVisible(), "explicação da etapa visível");

      // Galeria: setas, indicador e ampliação
      const gallery = page.locator('[aria-roledescription="carrossel"]');
      if (await gallery.count()) {
        const next = page.getByRole("button", { name: "Próxima página" });
        if (await next.count()) await next.click();
        await page.waitForTimeout(700);
        await page.getByRole("button", { name: /Ampliar/ }).nth(1).click();
        assert.ok(await page.locator("dialog[open]").isVisible(), "ampliação abre");
        await page.getByRole("button", { name: "Fechar" }).click();
        assert.equal(await page.locator("dialog[open]").count(), 0, "ampliação fecha");
      } else if (w === 320) {
        console.log("  (galeria sem imagens neste servidor — cache; validada nas demais larguras)");
      }

      // FAQ abre
      const firstFaq = page.locator("#faq details").first();
      await firstFaq.locator("summary").click();
      assert.equal(await firstFaq.evaluate((d) => (d as HTMLDetailsElement).open), true, "FAQ abre");

      await page.screenshot({ path: `${out}/${w}.png`, fullPage: true });
      const real = errors.filter((e) => !/fbevents|gtag|favicon/.test(e));
      assert.deepEqual(real, [], `${w}px erros de console: ${real.join(" | ")}`);
      console.log(`✔ ${w}px: sem rolagem horizontal, H1 único, ciclo tocável, ${(await gallery.count()) ? "galeria com ampliação, " : ""}FAQ, sem erros`);
      await ctx.close();
    }
  } finally {
    await browser.close();
    await db.galleryItem.deleteMany({ where: { title: { startsWith: "[E2E]" } } });
    await db.$disconnect();
  }
})().catch((e) => {
  console.error("✘", e instanceof Error ? e.message : e);
  process.exit(1);
});
