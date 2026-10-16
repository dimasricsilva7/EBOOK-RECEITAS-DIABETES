// Gera as imagens do site com IA gratuita (Pollinations / flux) e salva como PNG em public/img.
// Uso: node scripts/gen-images.mjs   (reexecuta só o que estiver faltando; passe --force para refazer tudo)
import sharp from "sharp";
import { mkdir, stat } from "node:fs/promises";
import { join } from "node:path";

const OUT = join(process.cwd(), "public", "img");
const FORCE = process.argv.includes("--force");
const NO_TEXT = ", photorealistic, no text, no words, no watermark";

const IMAGES = [
  { file: "hero.png", w: 1200, h: 1000, seed: 11, prompt: "a beautiful table full of colorful healthy balanced brazilian dishes, grilled chicken, fresh salads, vegetables, whole grains, bright natural daylight, fresh and appetizing, food photography, top down" + NO_TEXT },
  { file: "hero-mockup.png", w: 900, h: 760, seed: 305, prompt: "3D product mockup of a diabetic healthy recipes ebook displayed on a smartphone and a tablet screen showing a colorful balanced plate, with a glucometer and fresh vegetables beside them, clean soft studio lighting, white background, e-commerce product collage" + NO_TEXT },
  { file: "ebook-cover.png", w: 900, h: 1200, seed: 221, prompt: "modern cookbook cover design for diabetics, portrait, a colorful healthy balanced plate centered, a small glucometer and fresh vegetables, clean green and white editorial layout, professional, soft studio light" },
  { file: "offer-pratica.png", w: 1000, h: 1000, seed: 31, prompt: "a cookbook next to a weekly meal planner notebook and a shopping list, flat lay on a light wooden table, healthy food styling, soft natural light" + NO_TEXT },
  { file: "offer-completa.png", w: 1000, h: 1000, seed: 411, prompt: "a complete collection of healthy diabetic cooking ebooks and planners shown on a tablet and phone with printed booklets, surrounded by fresh vegetables and a glucometer, bright, editorial flat lay" + NO_TEXT },
  { file: "showcase.png", w: 1000, h: 1000, seed: 51, prompt: "a tablet and a smartphone showing a healthy recipe app, on a clean kitchen counter with fresh ingredients, bright natural light, product mockup" + NO_TEXT },
  { file: "dish-1.png", w: 800, h: 800, seed: 61, prompt: "colorful balanced lunch plate, grilled fish, brown rice, fresh salad and vegetables, brazilian home cooking, bright food photography" + NO_TEXT },
  { file: "dish-2.png", w: 800, h: 800, seed: 62, prompt: "healthy breakfast, whole grain toast, scrambled eggs, fresh fruit and coffee, bright morning light, food photography" + NO_TEXT },
  { file: "dish-3.png", w: 800, h: 800, seed: 63, prompt: "quick healthy snack, natural yogurt bowl with fresh fruits and seeds, bright food photography" + NO_TEXT },
  { file: "dish-4.png", w: 800, h: 800, seed: 64, prompt: "light fruit based dessert, small elegant portion, berries, bright food photography" + NO_TEXT },
  { file: "kit-planejamento.png", w: 800, h: 800, seed: 71, prompt: "a weekly meal planner notebook and a handwritten shopping list on a light table with a pen, minimal, bright" + NO_TEXT },
  { file: "cafe-da-manha.png", w: 800, h: 800, seed: 72, prompt: "healthy breakfast and practical snacks spread on a table, fruit, yogurt, whole grain, bright food photography" + NO_TEXT },
  { file: "sobremesas.png", w: 800, h: 800, seed: 733, prompt: "sugar free healthy desserts for diabetics, chocolate mousse and berry cake slices, elegant small portions, bright food photography" + NO_TEXT },
  { file: "guia-rotulos.png", w: 800, h: 800, seed: 74, prompt: "a person reading a food product nutrition label at a bright grocery store, healthy shopping lifestyle" + NO_TEXT },
  { file: "upsell-organizador-30.png", w: 800, h: 800, seed: 81, prompt: "a monthly meal planning calendar with notebooks and a pen on an organized desk, bright, flat lay" + NO_TEXT },
  { file: "upsell-minicurso.png", w: 800, h: 800, seed: 82, prompt: "a clean organized modern kitchen with labeled glass containers and fresh ingredients ready for meal prep, bright" + NO_TEXT },
  { file: "upsell-kit-familia.png", w: 800, h: 800, seed: 83, prompt: "a family healthy dinner table set with colorful balanced dishes, warm bright home, food photography" + NO_TEXT },
  { file: "downsell-organizador-7.png", w: 800, h: 800, seed: 84, prompt: "a simple weekly 7 day meal planner notebook with a short shopping list, minimal, bright flat lay" + NO_TEXT },
];

const exists = async (p) => { try { return (await stat(p)).size > 10000; } catch { return false; } };

async function fetchOne(img) {
  const base = `https://image.pollinations.ai/prompt/${encodeURIComponent(img.prompt)}`;
  const url = `${base}?width=${img.w}&height=${img.h}&nologo=true&seed=${img.seed}&model=flux`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 100000);
      const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0" } });
      clearTimeout(to);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 5000) throw new Error(`arquivo pequeno (${buf.length})`);
      await sharp(buf).resize(img.w, img.h, { fit: "cover" }).png({ quality: 82 }).toFile(join(OUT, img.file));
      return true;
    } catch (e) {
      console.log(`  tentativa ${attempt} falhou (${img.file}): ${e.message}`);
      await new Promise((r) => setTimeout(r, 2500 * attempt));
    }
  }
  return false;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  let ok = 0, skip = 0, fail = 0;
  for (const img of IMAGES) {
    const path = join(OUT, img.file);
    if (!FORCE && (await exists(path))) { skip++; console.log(`• ${img.file} já existe`); continue; }
    process.stdout.write(`↓ ${img.file} … `);
    if (await fetchOne(img)) { ok++; console.log("ok"); } else { fail++; console.log("FALHOU"); }
  }
  console.log(`\nImagens: ${ok} geradas, ${skip} já existiam, ${fail} falharam.`);
  if (fail) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exit(1); });
