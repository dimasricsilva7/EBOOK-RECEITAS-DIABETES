// Inspeciona mídia/imagens do banco APONTADO por DATABASE_URL (passe o de produção inline).
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
(async () => {
  const media = await db.mediaAsset.findMany({ select: { id: true, name: true, category: true, storage: true, url: true, width: true, height: true, createdAt: true }, orderBy: { createdAt: "asc" } });
  console.log(`=== MediaAsset (${media.length}) ===`);
  for (const m of media) console.log(`  [${m.category}] ${m.name} | ${m.storage} | ${m.url} | ${m.width}x${m.height}`);

  const prods = await db.product.findMany({ select: { slug: true, name: true, imageUrl: true }, orderBy: { sortOrder: "asc" } });
  console.log(`\n=== Produtos / imageUrl ===`);
  for (const p of prods) console.log(`  ${p.slug}: ${p.imageUrl ?? "(sem imagem)"}`);

  const keys = ["author_name", "author_role", "author_bio", "author_photo_url", "logo_url", "og_image_url", "favicon_url"];
  const settings = await db.setting.findMany({ where: { key: { in: keys } } });
  console.log(`\n=== Settings de autoria/marca ===`);
  for (const s of settings) console.log(`  ${s.key} = ${JSON.stringify(s.value)}`);

  const autora = await db.landingSection.findUnique({ where: { key: "autora" } });
  console.log(`\n=== Seção 'autora' ===`);
  console.log(autora ? `  ativa=${autora.active} imageUrl=${autora.imageUrl} config=${JSON.stringify(autora.config)}` : "  (não existe)");

  const gallery = await db.galleryItem.findMany({ select: { title: true, imageUrl: true } });
  console.log(`\n=== Galeria (${gallery.length}) ===`);
  for (const g of gallery) console.log(`  ${g.title}: ${g.imageUrl}`);

  await db.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
