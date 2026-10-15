/**
 * Screenshots + verificação de scroll horizontal em várias larguras.
 *   npx tsx scripts/screenshots.ts [baseUrl] [outDir] [paths...]
 *   WIDTHS=360,375,390,412,430,768,1024,1280,1440,1920 FULL=1 npx tsx scripts/screenshots.ts
 */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const base = process.argv[2] ?? "http://localhost:3000";
const out = process.argv[3] ?? "screenshots";
const paths = process.argv.slice(4).length ? process.argv.slice(4) : ["/", "/loja", "/produto/kit-96-cores", "/checkout", "/acompanhar"];
const widths = (process.env.WIDTHS ?? "390,1440").split(",").map(Number);
const full = process.env.FULL !== "0";

(async () => {
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  let problems = 0;
  for (const w of widths) {
    const ctx = await browser.newContext({ viewport: { width: w, height: w < 800 ? 844 : 900 }, deviceScaleFactor: 1, isMobile: w < 800, hasTouch: w < 800 });
    await ctx.addCookies([{ name: "adf_consent", value: "denied", url: base }]);
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    for (const p of paths) {
      await page.goto(base + p, { waitUntil: "networkidle" });
      // rola a página inteira para disparar as animações de entrada
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 500) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 60));
        }
        window.scrollTo(0, 0);
        await new Promise((r) => setTimeout(r, 700));
      });
      const overflow = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const offenders: string[] = [];
        document.querySelectorAll("body *").forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.right > vw + 1 && r.width > 0 && getComputedStyle(el).position !== "fixed" && !el.closest(".overflow-x-auto,.overflow-hidden,.no-scrollbar")) {
            offenders.push(`${el.tagName.toLowerCase()}.${(el.getAttribute("class") ?? "").slice(0, 60)} → ${Math.round(r.right)}px`);
          }
        });
        return { scroll: document.documentElement.scrollWidth > vw, offenders: offenders.slice(0, 5) };
      });
      if (overflow.scroll || overflow.offenders.length) {
        problems++;
        console.log(`⚠ ${w}px ${p}: overflow`, overflow.offenders);
      } else console.log(`✔ ${w}px ${p}`);
      await page.screenshot({ path: `${out}/${w}${p.replace(/[/?=&#]/g, "_") || "_home"}.png`, fullPage: full });
    }
    if (errors.length) console.log(`  erros de console em ${w}px:`, [...new Set(errors)].slice(0, 5));
    await ctx.close();
  }
  await browser.close();
  process.exitCode = problems ? 1 : 0;
})();
