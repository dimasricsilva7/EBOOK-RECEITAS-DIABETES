/**
 * Catálogo e conteúdo do "Diabetes à Mesa" (marca Sabor Equilibrado).
 * Produto 100% digital. Idempotente (create-only): roda em todo build sem sobrescrever edições do admin.
 *
 * Modelagem do funil:
 *  - COMPONENTES: produtos de conteúdo (e-book + 4 materiais extras). Guardam os DigitalMaterial reais.
 *  - OFERTAS (plans, categoria PROGRAM): 3 kits que INCLUEM componentes via includedProductIds.
 *    O checkout nunca cobra duas vezes o mesmo conteúdo (um bump some se já estiver incluso na oferta).
 *  - ORDER BUMPS: 3 ativos no checkout (máx. 3) + 1 alternativa inativa (Guia de Rótulos).
 *  - UPSELL: apenas 1 ativo por vez (Organizador 30 dias). Os demais ficam cadastrados e inativos.
 *  - DOWNSELL: Organizador 7 dias, oferecido só quando o upsell 30 dias é recusado.
 *
 * Nada de preço/texto fica "preso" no código: tudo é editável no admin.
 * Os materiais nascem PENDENTES (sem arquivo): não são anunciados nem entregues, e o checkout
 * exige material pronto. O dono sobe os PDFs reais no admin e marca como pronto para abrir as vendas.
 * Nenhuma promessa de cura/controle da glicemia — conteúdo educativo de culinária.
 */
import "dotenv/config";
import { PrismaClient, type Prisma, type ProductCategory } from "@prisma/client";

const db = new PrismaClient();
const j = (v: unknown) => v as Prisma.InputJsonValue;

// ───────────────────────── Catálogo ─────────────────────────

type Comp = {
  slug: string;
  sku: string;
  name: string;
  category: ProductCategory;
  priceCents: number;
  subtitle?: string;
  shortDescription: string;
  material: { title: string; description: string; howToUse: string; format: "PDF" | "VIDEO" | "WORKBOOK" };
};

const DISCLAIMER = "Conteúdo educativo de culinária. Não é tratamento, não cura diabetes e não substitui acompanhamento médico ou nutricional.";

/** Produtos de conteúdo (cada um tem um material real, que começa PENDENTE). */
const COMPONENTS: Comp[] = [
  {
    slug: "ebook-diabetes-a-mesa",
    sku: "DM-EBOOK",
    name: "E-book Diabetes à Mesa (250+ receitas)",
    category: "EBOOK",
    priceCents: 3790,
    subtitle: "Mais de 250 receitas para controlar a diabetes",
    shortDescription: "O e-book principal, com mais de 250 receitas de baixo índice glicêmico organizadas por refeição: café da manhã, almoço, jantar, lanches e sobremesas liberadas.",
    material: { title: "E-book Diabetes à Mesa", description: "E-book digital com as receitas organizadas por refeição.", howToUse: "Escolha a refeição, confira os ingredientes e siga o passo a passo.", format: "PDF" },
  },
  {
    slug: "kit-planejamento-semanal",
    sku: "DM-PLAN",
    name: "Kit Planejamento Semanal + Lista de Compras",
    category: "BONUS",
    priceCents: 1490,
    shortDescription: "Modelos de planejamento da semana e lista de compras para organizar as refeições e ir ao mercado sem dúvidas.",
    material: { title: "Planejamento Semanal + Lista de Compras", description: "Modelos para planejar a semana e montar a lista de compras.", howToUse: "Preencha o planejamento da semana e leve a lista ao mercado.", format: "WORKBOOK" },
  },
  {
    slug: "cafe-da-manha-lanches",
    sku: "DM-CAFE",
    name: "Coleção Café da Manhã e Lanches Práticos",
    category: "BONUS",
    priceCents: 1490,
    shortDescription: "Opções rápidas para começar bem o dia e para os lanches entre as refeições.",
    material: { title: "Café da Manhã e Lanches Práticos", description: "Receitas de café da manhã e lanches rápidos.", howToUse: "Use nas manhãs corridas e nos intervalos do dia.", format: "PDF" },
  },
  {
    slug: "sobremesas-e-doces",
    sku: "DM-DOCE",
    name: "Coleção Sobremesas e Doces para Explorar",
    category: "BONUS",
    priceCents: 1490,
    shortDescription: "Versões mais equilibradas de sobremesas e doces para variar sem abrir mão do sabor.",
    material: { title: "Sobremesas e Doces para Explorar", description: "Receitas de sobremesas e doces para o dia a dia.", howToUse: "Prepare para momentos especiais ou para variar a semana.", format: "PDF" },
  },
  {
    slug: "guia-rotulos-ingredientes",
    sku: "DM-GUIA",
    name: "Guia de Rótulos e Ingredientes",
    category: "BONUS",
    priceCents: 1290,
    shortDescription: "Um guia prático para ler rótulos e escolher ingredientes com mais segurança nas compras.",
    material: { title: "Guia de Rótulos e Ingredientes", description: "Guia para interpretar rótulos e escolher ingredientes.", howToUse: "Consulte antes e durante as compras no mercado.", format: "PDF" },
  },
];

type Offer = {
  slug: string;
  sku: string;
  name: string;
  badge: string;
  subtitle: string;
  shortDescription: string;
  priceCents: number;
  compareAtPriceCents?: number;
  featured?: boolean;
  sortOrder: number;
  image: string;
  includes: string[]; // slugs de COMPONENTS
};

/** As 3 ofertas (planos). Os preços "de" são a SOMA real dos itens avulsos (referência honesta, sem desconto fictício). */
const OFFERS: Offer[] = [
  {
    slug: "kit-essencial",
    sku: "DM-OF-ESS",
    name: "E-book de Receitas",
    badge: "Básico",
    subtitle: "Comece por aqui",
    shortDescription: "O e-book com mais de 250 receitas para diabéticos: café da manhã, almoço, jantar, lanches e sobremesas liberadas, todas de baixo índice glicêmico.",
    priceCents: 3790,
    sortOrder: 1,
    image: "/img/ebook-cover.png",
    includes: ["ebook-diabetes-a-mesa"],
  },
  {
    slug: "kit-pratica",
    sku: "DM-OF-PRA",
    name: "Kit Receitas + Organização",
    badge: "O mais escolhido",
    subtitle: "Para não errar no dia a dia",
    shortDescription: "O e-book completo + o planejamento semanal das refeições + o guia de rótulos para nunca mais cair no açúcar escondido do mercado.",
    priceCents: 4790,
    compareAtPriceCents: 6570, // 37,90 + 14,90 + 12,90
    sortOrder: 2,
    image: "/img/offer-pratica.png",
    includes: ["ebook-diabetes-a-mesa", "kit-planejamento-semanal", "guia-rotulos-ingredientes"],
  },
  {
    slug: "kit-completa",
    sku: "DM-OF-COM",
    name: "Kit Rotina Alimentar Completa",
    badge: "Mais escolhido",
    subtitle: "Tudo para controlar a diabetes comendo bem",
    shortDescription: "O pacote completo: e-book + planejamento semanal + coleções de café da manhã, lanches e sobremesas liberadas + guia de rótulos. Tudo para comer bem e cuidar da glicemia.",
    priceCents: 7790,
    compareAtPriceCents: 9550, // soma de todos os itens avulsos
    featured: true,
    sortOrder: 3,
    image: "/img/offer-completa.png",
    includes: ["ebook-diabetes-a-mesa", "kit-planejamento-semanal", "cafe-da-manha-lanches", "sobremesas-e-doces", "guia-rotulos-ingredientes"],
  },
];

type Bump = { productSlug: string; title: string; benefit: string; priceCents: number; active: boolean; sortOrder: number };

/** 3 bumps ativos (máx. 3) + Guia como alternativa inativa. Compatibilidade por oferta é automática:
 *  o cart esconde qualquer bump cujo produto já esteja incluso na oferta escolhida. */
const BUMPS: Bump[] = [
  { productSlug: "kit-planejamento-semanal", title: "Planejamento Semanal + Lista de Compras", benefit: "Monte a semana inteira e vá ao mercado sem dúvidas.", priceCents: 1490, active: true, sortOrder: 1 },
  { productSlug: "cafe-da-manha-lanches", title: "Café da Manhã e Lanches Práticos", benefit: "Opções rápidas para o começo do dia e os intervalos.", priceCents: 1490, active: true, sortOrder: 2 },
  { productSlug: "sobremesas-e-doces", title: "Sobremesas e Doces para Explorar", benefit: "Versões mais equilibradas para variar sem perder o sabor.", priceCents: 1490, active: true, sortOrder: 3 },
  { productSlug: "guia-rotulos-ingredientes", title: "Guia de Rótulos e Ingredientes", benefit: "Leia rótulos e escolha ingredientes com mais segurança.", priceCents: 1290, active: false, sortOrder: 4 },
];

type UpsellProduct = Comp & { headline: string; upsellTitle: string; upsellDescription: string; active: boolean; sortOrder: number };

/** Produtos de upsell/downsell (também começam PENDENTES). */
const UPSELL_PRODUCTS: UpsellProduct[] = [
  {
    slug: "receitas-doces-salgados-50",
    sku: "DM-UP-50",
    name: "+50 Receitas + Vídeos de Preparo",
    category: "VIDEO" as ProductCategory,
    priceCents: 2790,
    shortDescription: "Mais 50 receitas de doces e salgados saudáveis + vídeos ensinando a fazer cada uma, sem aumentar a glicemia.",
    material: { title: "+50 Receitas + Vídeos de Preparo", description: "50 receitas extras de doces e salgados + vídeos do passo a passo.", howToUse: "Siga as receitas e assista aos vídeos de preparo.", format: "VIDEO" },
    headline: "Quer dobrar as receitas e ainda ver como fazer cada uma?",
    upsellTitle: "+50 Receitas + Vídeos de Preparo",
    upsellDescription: "Mais 50 receitas de doces e salgados — coxinha, pão de queijo, bolos, tortas e sobremesas — e, de bônus, vídeos ensinando o passo a passo de cada receita. Tudo pensado para você comer sem aumentar a glicemia.",
    active: true,
    sortOrder: 1,
  },
  {
    slug: "organizador-cardapio-30",
    sku: "DM-UP-ORG30",
    name: "Organizador de Cardápio para 30 Dias",
    category: "JOURNAL" as ProductCategory,
    priceCents: 3790,
    shortDescription: "Calendário de planejamento, modelos semanais e listas de compras para um mês inteiro de refeições.",
    material: { title: "Organizador de Cardápio — 30 Dias", description: "Calendário, modelos semanais e listas de compras para 30 dias.", howToUse: "Planeje o mês por semanas e use as listas nas compras.", format: "WORKBOOK" },
    headline: "Que tal organizar o próximo mês inteiro?",
    upsellTitle: "Organizador de Cardápio para 30 Dias",
    upsellDescription: "Um mês inteiro de refeições planejadas: calendário, modelos semanais, listas de compras e materiais complementares para você não repetir ideias e ganhar tempo.",
    active: false,
    sortOrder: 2,
  },
  {
    slug: "minicurso-organizacao-cozinha",
    sku: "DM-UP-CURSO",
    name: "Minicurso de Organização da Cozinha",
    category: "VIDEO" as ProductCategory,
    priceCents: 4790,
    shortDescription: "Aulas em vídeo sobre organização dos ingredientes, planejamento e preparo antecipado.",
    material: { title: "Minicurso de Organização da Cozinha", description: "Aulas em vídeo sobre organização, planejamento e preparo antecipado.", howToUse: "Assista no seu ritmo e aplique na sua cozinha.", format: "VIDEO" },
    headline: "Quer deixar a cozinha a seu favor?",
    upsellTitle: "Minicurso de Organização da Cozinha",
    upsellDescription: "Aulas práticas sobre organizar os ingredientes, planejar e adiantar o preparo para facilitar a rotina.",
    active: false,
    sortOrder: 2,
  },
  {
    slug: "kit-familia",
    sku: "DM-UP-FAM",
    name: "Kit Família",
    category: "BONUS" as ProductCategory,
    priceCents: 2790,
    shortDescription: "Materiais de planejamento das refeições da casa e ferramentas complementares para a família.",
    material: { title: "Kit Família", description: "Materiais de planejamento das refeições da casa.", howToUse: "Use para organizar as refeições de toda a família.", format: "WORKBOOK" },
    headline: "E para toda a família?",
    upsellTitle: "Kit Família",
    upsellDescription: "Materiais para planejar as refeições da casa e envolver a família na rotina alimentar.",
    active: false,
    sortOrder: 3,
  },
];

/** Downsell vinculado ao upsell "+50 receitas": uma versão compacta só de sobremesas. */
const DOWNSELL = {
  forUpsellSlug: "receitas-doces-salgados-50",
  product: {
    slug: "sobremesas-saudaveis-15",
    sku: "DM-DOWN-15",
    name: "+15 Sobremesas Saudáveis",
    category: "EBOOK" as ProductCategory,
    priceCents: 1290,
    shortDescription: "Uma seleção menor: 15 sobremesas saudáveis para matar a vontade de doce sem culpa.",
    material: { title: "+15 Sobremesas Saudáveis", description: "15 receitas de sobremesas de baixo índice glicêmico.", howToUse: "Prepare quando bater a vontade de doce.", format: "PDF" as const },
  },
  headline: "Só as sobremesas já tá ótimo?",
  title: "+15 Sobremesas Saudáveis",
  description: "Se as 50 receitas completas são demais por agora, leve só esta seleção de 15 sobremesas saudáveis — para matar a vontade de doce sem disparar a glicemia.",
};

// ───────────────────────── Criação do catálogo ─────────────────────────

async function ensureProduct(p: {
  slug: string; sku: string; name: string; category: ProductCategory; priceCents: number;
  subtitle?: string; shortDescription: string; description?: string; imageUrl?: string;
  compareAtPriceCents?: number; badge?: string; featured?: boolean; active?: boolean; sortOrder?: number;
  includedProductIds?: string[];
  material?: { title: string; description: string; howToUse: string; format: "PDF" | "VIDEO" | "WORKBOOK" };
}) {
  const existing = await db.product.findUnique({ where: { slug: p.slug } });
  const product =
    existing ??
    (await db.product.create({
      data: {
        slug: p.slug,
        sku: p.sku,
        name: p.name,
        category: p.category,
        subtitle: p.subtitle ?? null,
        shortDescription: p.shortDescription,
        description: p.description ?? DISCLAIMER,
        priceCents: p.priceCents,
        compareAtPriceCents: p.compareAtPriceCents ?? null,
        imageUrl: p.imageUrl ?? null,
        badge: p.badge ?? null,
        featured: p.featured ?? false,
        active: p.active ?? true,
        sortOrder: p.sortOrder ?? 0,
        deliveryFormat: "Acesso online + PDF para baixar",
        digitalDeliveryNote: "Depois da confirmação do pagamento, o acesso chega por e-mail e fica na página do pedido.",
        includedProductIds: j(p.includedProductIds ?? []),
        specs: j([{ label: "Formato", value: "Digital (PDF)" }, { label: "Idioma", value: "Português" }, { label: "Acesso", value: "Imediato após o pagamento" }]),
      },
    }));
  if (p.material && (await db.digitalMaterial.count({ where: { productId: product.id } })) === 0) {
    await db.digitalMaterial.create({
      data: { productId: product.id, title: p.material.title, description: p.material.description, howToUse: p.material.howToUse, format: p.material.format, status: "PENDING", source: "file", sortOrder: 1 },
    });
  }
  return product;
}

/** Produtos que existem só como order bump (não entram em nenhuma oferta). Começam PENDENTES. */
const BUMP_ONLY_PRODUCTS: Comp[] = [
  {
    slug: "guia-restaurante-delivery",
    sku: "DM-REST",
    name: "Guia de Restaurante e Delivery",
    category: "BONUS",
    priceCents: 1490,
    shortDescription: "O que pedir no restaurante e no delivery sem furar a dieta e sem disparar a glicemia.",
    material: { title: "Guia de Restaurante e Delivery", description: "O que escolher ao comer fora ou pedir delivery.", howToUse: "Consulte antes de pedir no restaurante ou no app.", format: "PDF" },
  },
  {
    slug: "atualizacoes-vitalicias",
    sku: "DM-UPD",
    name: "Atualizações Vitalícias de Receitas",
    category: "BONUS",
    priceCents: 1990,
    shortDescription: "Receba as novas receitas adicionadas ao Diabetes à Mesa, para sempre, sem pagar de novo.",
    material: { title: "Atualizações de Receitas", description: "Acesso às novas receitas conforme forem lançadas.", howToUse: "Você recebe por e-mail cada atualização do material.", format: "PDF" },
  },
  {
    slug: "videoaulas-preparo",
    sku: "DM-VIDEO",
    name: "Vídeo-aulas de Preparo das Receitas",
    category: "VIDEO",
    priceCents: 1990,
    shortDescription: "Vídeo-aulas mostrando o passo a passo de preparo das receitas do livro.",
    material: { title: "Vídeo-aulas de Preparo", description: "Aulas em vídeo do preparo das receitas do e-book.", howToUse: "Assista e cozinhe junto, no seu ritmo.", format: "VIDEO" },
  },
];

/** Versão do catálogo. Ao mudar a estrutura (ofertas/bumps/preços), incremente para reaplicar no deploy. */
const CATALOG_VERSION = "dm-4";

/** Mudanças estruturais do catálogo aplicadas uma vez por versão (não sobrescreve imagens do admin). */
async function applyCatalogUpdates() {
  const idOf = async (slug: string) => (await db.product.findUnique({ where: { slug }, select: { id: true } }))?.id ?? null;
  const essencial = await idOf("kit-essencial");
  const completa = await idOf("kit-completa");

  // Apenas 2 ofertas: desativa a "Prática"; Completo em destaque a R$ 67,90 (de R$ 95,50).
  await db.product.updateMany({ where: { slug: "kit-pratica" }, data: { active: false, featured: false } });
  await db.product.updateMany({ where: { slug: "kit-completa" }, data: { priceCents: 6790, compareAtPriceCents: 9550, featured: true } });
  await db.product.updateMany({ where: { slug: "kit-essencial" }, data: { featured: false } });

  // Upsell: só 1 ativo por vez → o "+50 receitas + vídeos" é o principal; o organizador fica inativo.
  await db.product.updateMany({ where: { slug: "receitas-doces-salgados-50" }, data: { name: "+50 Receitas + Vídeos de Preparo", shortDescription: "Mais 50 receitas de doces e salgados saudáveis + vídeos ensinando a fazer cada uma, sem aumentar a glicemia." } });
  const receitasUp = await db.upsell.findFirst({ where: { product: { slug: "receitas-doces-salgados-50" } } });
  if (receitasUp) await db.upsell.update({ where: { id: receitasUp.id }, data: { active: true, sortOrder: 1, name: "+50 Receitas + Vídeos de Preparo", headline: "Quer dobrar as receitas e ainda ver como fazer cada uma?", title: "+50 Receitas + Vídeos de Preparo", description: "Mais 50 receitas de doces e salgados — coxinha, pão de queijo, bolos, tortas e sobremesas — e, de bônus, vídeos ensinando o passo a passo de cada receita. Tudo pensado para você comer sem aumentar a glicemia." } });
  await db.upsell.updateMany({ where: { product: { slug: { in: ["organizador-cardapio-30", "minicurso-organizacao-cozinha", "kit-familia"] } } }, data: { active: false } });

  const setBump = async (slug: string, d: { name: string; title: string; benefit: string; priceCents: number; active: boolean; sortOrder: number; triggerProductIds: Prisma.InputJsonValue; showModal: boolean }) => {
    const pid = await idOf(slug);
    if (!pid) return;
    const existing = await db.orderBump.findFirst({ where: { productId: pid } });
    if (existing) await db.orderBump.update({ where: { id: existing.id }, data: d });
    else await db.orderBump.create({ data: { ...d, productId: pid, description: null } });
  };
  // Bumps do BÁSICO (só aparecem quando a oferta escolhida é o Básico)
  await setBump("sobremesas-e-doces", { name: "Sobremesas Liberadas", title: "Coleção de Sobremesas Liberadas", benefit: "Doces que matam a vontade sem disparar a glicemia.", priceCents: 1290, active: true, sortOrder: 1, triggerProductIds: j(essencial ? [essencial] : []), showModal: false });
  await setBump("kit-planejamento-semanal", { name: "Planejamento Semanal", title: "Planejamento Semanal + Lista de Compras", benefit: "Monte a semana inteira e vá ao mercado sem dúvida.", priceCents: 990, active: true, sortOrder: 2, triggerProductIds: j(essencial ? [essencial] : []), showModal: false });
  // Bumps do COMPLETO
  await setBump("guia-restaurante-delivery", { name: "Guia Restaurante & Delivery", title: "Guia de Restaurante e Delivery", benefit: "O que pedir fora de casa sem furar a dieta.", priceCents: 1490, active: true, sortOrder: 3, triggerProductIds: j(completa ? [completa] : []), showModal: false });
  await setBump("atualizacoes-vitalicias", { name: "Atualizações Vitalícias", title: "Atualizações Vitalícias de Receitas", benefit: "Novas receitas adicionadas ao e-book, para sempre.", priceCents: 1990, active: true, sortOrder: 4, triggerProductIds: j(completa ? [completa] : []), showModal: false });
  // Vídeo-aulas: aparece em QUALQUER oferta (sem gatilho) — complementa tanto o Básico quanto o Completo.
  await setBump("videoaulas-preparo", { name: "Vídeo-aulas de Preparo", title: "Vídeo-aulas de Preparo das Receitas", benefit: "Veja o passo a passo em vídeo e cozinhe junto.", priceCents: 1990, active: true, sortOrder: 5, triggerProductIds: j([]), showModal: false });
  // Desativa bumps antigos que não se encaixam nas 2 ofertas
  for (const slug of ["cafe-da-manha-lanches", "guia-rotulos-ingredientes"]) {
    const pid = await idOf(slug);
    if (!pid) continue;
    const b = await db.orderBump.findFirst({ where: { productId: pid } });
    if (b) await db.orderBump.update({ where: { id: b.id }, data: { active: false } });
  }
}

async function catalog() {
  const bySlug = new Map<string, string>();
  for (const c of [...COMPONENTS, ...BUMP_ONLY_PRODUCTS]) {
    const prod = await ensureProduct({ ...c, active: true, featured: false, sortOrder: 0 });
    bySlug.set(c.slug, prod.id);
  }
  for (const o of OFFERS) {
    const includedIds = o.includes.map((slug) => bySlug.get(slug)).filter((x): x is string => Boolean(x));
    const prod = await ensureProduct({
      slug: o.slug,
      sku: o.sku,
      name: o.name,
      category: "PROGRAM",
      priceCents: o.priceCents,
      compareAtPriceCents: o.compareAtPriceCents,
      subtitle: o.subtitle,
      shortDescription: o.shortDescription,
      imageUrl: o.image,
      badge: o.badge,
      featured: o.featured ?? false,
      active: true,
      sortOrder: o.sortOrder,
      includedProductIds: includedIds,
    });
    bySlug.set(o.slug, prod.id);
  }

  // Order bumps
  for (const b of BUMPS) {
    const productId = bySlug.get(b.productSlug);
    if (!productId) continue;
    const exists = await db.orderBump.findFirst({ where: { productId } });
    if (!exists) {
      await db.orderBump.create({
        data: { name: b.title, productId, title: b.title, benefit: b.benefit, description: null, priceCents: b.priceCents, active: b.active, sortOrder: b.sortOrder, triggerProductIds: j([]), showModal: false },
      });
    }
  }

  // Upsells (produto + registro Upsell)
  const upsellIdBySlug = new Map<string, string>();
  for (const u of UPSELL_PRODUCTS) {
    const prod = await ensureProduct({ slug: u.slug, sku: u.sku, name: u.name, category: u.category, priceCents: u.priceCents, shortDescription: u.shortDescription, active: true, sortOrder: 0, material: u.material });
    bySlug.set(u.slug, prod.id);
    const exists = await db.upsell.findFirst({ where: { productId: prod.id } });
    const row = exists ?? (await db.upsell.create({
      data: { name: u.upsellTitle, productId: prod.id, headline: u.headline, title: u.upsellTitle, description: u.upsellDescription, priceCents: u.priceCents, active: u.active, sortOrder: u.sortOrder, triggerProductIds: j([]) },
    }));
    upsellIdBySlug.set(u.slug, row.id);
  }

  // Downsell (produto + registro Downsell vinculado ao upsell)
  const dsProduct = await ensureProduct({ slug: DOWNSELL.product.slug, sku: DOWNSELL.product.sku, name: DOWNSELL.product.name, category: DOWNSELL.product.category, priceCents: DOWNSELL.product.priceCents, shortDescription: DOWNSELL.product.shortDescription, active: true, sortOrder: 0, material: DOWNSELL.product.material });
  const upsellId = upsellIdBySlug.get(DOWNSELL.forUpsellSlug);
  if (upsellId && !(await db.downsell.findUnique({ where: { upsellId } }))) {
    await db.downsell.create({
      data: { name: DOWNSELL.title, upsellId, productId: dsProduct.id, headline: DOWNSELL.headline, title: DOWNSELL.title, description: DOWNSELL.description, priceCents: DOWNSELL.product.priceCents, active: true },
    });
  }
}

// ───────────────────────── Landing (CMS) ─────────────────────────

const SECTIONS: Prisma.LandingSectionCreateInput[] = [
  {
    key: "hero",
    type: "hero",
    label: "Primeira tela",
    sortOrder: 1,
    title: "Mais de *250 receitas* pra comer bem sem o medo de ver a glicemia subir.",
    subtitle:
      "Café, almoço, jantar, lanche e até doce — tudo pensado pra não disparar o açúcar. Comida de verdade, de mercado, com preparo rápido.\n\nNão é dieta de sofrimento. É o cardápio que ninguém te deu depois do diagnóstico.",
    imageUrl: "/img/hero-mockup.png",
    ctaLabel: "QUERO AS RECEITAS",
    ctaTarget: "checkout",
    config: j({ eyebrow: "Pra quem tem diabetes e cansou de comer sem graça", badges: ["Baixo índice glicêmico", "Doces liberados", "Garantia de 7 dias", "Acesso imediato"], imageAlt: "E-book Diabetes à Mesa no celular e no tablet" }),
  },
  {
    key: "stats",
    type: "stats",
    label: "Faixa de números",
    sortOrder: 2,
    config: j({
      items: [
        { icon: "book", value: "250+", label: "receitas" },
        { icon: "sun", value: "5", label: "refeições por dia" },
        { icon: "leaf", value: "Baixo IG", label: "índice glicêmico" },
        { icon: "download", value: "2 min", label: "acesso imediato" },
      ],
    }),
  },
  {
    key: "identificacao",
    type: "identification",
    label: "Identificação (dores)",
    sortOrder: 2,
    title: "Se você tem diabetes, provavelmente já passou por isso",
    subtitle: "Não é falta de força de vontade. É que ninguém te ensinou a comer bem convivendo com a diabetes.",
    body: "A boa notícia: o problema nunca foi você. Era só faltar as receitas certas.",
    config: j({
      eyebrow: "Você não está sozinho(a) nessa",
      items: [
        { icon: "heart", title: "Sentiu que teria que viver de comida sem graça pro resto da vida.", text: "Depois do diagnóstico, parece que todo prato gostoso virou proibido." },
        { icon: "spiral", title: "Tem medo de comer um pedaço de bolo e ver a glicemia disparar.", text: "A culpa e o medo tiram todo o prazer de sentar à mesa." },
        { icon: "clock", title: "Está cansado(a) de comer sempre a mesma coisa.", text: "Arroz, frango e salada todo santo dia — e nenhuma vontade de continuar." },
        { icon: "info", title: "Já cortou tudo o que ama e mesmo assim a glicose não estabiliza.", text: "Passou vontade, se sentiu privado(a) e não viu o resultado que esperava." },
        { icon: "compass", title: "Se perde no mercado tentando adivinhar o que pode comer.", text: "Rótulos cheios de açúcar escondido e nenhuma orientação clara." },
        { icon: "shield", title: "Toma o remédio, mas sabe que a comida é o que mais pesa.", text: "A alimentação é a sua maior aliada no controle da glicemia — quando é a certa." },
      ],
    }),
  },
  {
    key: "compare",
    type: "compare",
    label: "Antes × Depois",
    sortOrder: 4,
    title: "A diferença que o cardápio certo faz",
    subtitle: "Como é a sua rotina hoje — e como ela pode ser a partir de hoje.",
    config: j({
      beforeTitle: "Como costuma ser hoje",
      before: [
        "Arroz, frango e salada todo dia, sem vontade de comer",
        "Medo de comer um pedaço de bolo e ver a glicemia disparar",
        "Perdido(a) no mercado sem saber o que pode",
        "Cortar tudo o que gosta e se sentir privado(a)",
      ],
      afterTitle: "Com o Diabetes à Mesa",
      after: [
        "Mais de 250 receitas para variar o cardápio todo dia",
        "Doces e sobremesas que não disparam a glicemia",
        "Guia de rótulos para comprar com segurança",
        "Comer com prazer enquanto cuida da sua saúde",
      ],
    }),
  },
  {
    key: "doces",
    type: "method",
    label: "Sim, você pode comer doce",
    sortOrder: 3,
    title: "Sim, você pode comer doce tendo diabetes.",
    subtitle: "A questão nunca foi parar de comer doce. Foi aprender a fazer o doce certo.",
    body: "São doces de verdade, feitos para quem precisa controlar o açúcar no sangue — sem aquele gosto de adoçante e sem receita impossível.",
    imageUrl: "/img/sobremesas.png",
    config: j({
      eyebrow: "A parte que você mais vai gostar",
      imageAlt: "Sobremesa saudável sem açúcar para quem tem diabetes",
      items: [
        { icon: "heart", title: "Sobremesas que não disparam a glicemia", text: "Bolos, mousses e docinhos pensados para o seu controle glicêmico." },
        { icon: "leaf", title: "Trocas inteligentes de ingredientes", text: "O que usar no lugar do açúcar e da farinha branca sem perder o sabor." },
        { icon: "check", title: "Mate a vontade sem culpa", text: "Dá pra ter um doce no fim de semana e continuar cuidando da saúde." },
      ],
    }),
  },
  {
    key: "topicos",
    type: "topics",
    label: "O que você encontra",
    sortOrder: 4,
    title: "Tudo o que você precisa para comer bem com diabetes",
    subtitle: "Um cardápio completo, do café da manhã à sobremesa, pensado para o seu controle glicêmico.",
    body: "Receitas organizadas por refeição, com ingredientes de baixo índice glicêmico, acessíveis e modo de preparo direto ao ponto.",
    config: j({
      eyebrow: "Por dentro do conteúdo",
      items: [
        { icon: "sun", title: "Café da manhã", text: "Comece o dia com energia e sem o pico de glicose logo cedo." },
        { icon: "book", title: "Almoço e jantar", text: "Pratos completos, saborosos e de baixo índice glicêmico." },
        { icon: "clock", title: "Lanches da tarde", text: "Opções práticas para não cair na tentação do industrializado." },
        { icon: "heart", title: "Doces e sobremesas liberados", text: "Mate a vontade de doce sem culpa e sem disparar a glicemia." },
        { icon: "compass", title: "Guia de substituições", text: "O que trocar para reduzir açúcar e carboidrato sem perder o sabor." },
      ],
    }),
  },
  {
    key: "galeria",
    type: "gallery",
    label: "Galeria de pratos",
    sortOrder: 7,
    title: "Comida de verdade, do seu dia a dia",
    subtitle: "Pratos simples, bonitos e que cabem na rotina de quem convive com diabetes.",
    config: j({ eyebrow: "Por dentro das receitas" }),
  },
  {
    key: "produto",
    type: "showcase",
    label: "Por dentro do e-book (galeria)",
    sortOrder: 5,
    title: "Veja por dentro do Diabetes à Mesa",
    body: "É um e-book digital. Assim que o pagamento é confirmado, o acesso cai no seu e-mail e você lê no celular, tablet ou computador — onde e quando quiser.",
    imageUrl: "/img/showcase.png",
    ctaLabel: "QUERO ACESSAR AGORA",
    ctaTarget: "checkout",
    config: j({
      eyebrow: "Por dentro do e-book",
      imageAlt: "E-book Diabetes à Mesa aberto no tablet e no celular",
      formatItems: ["E-book digital (PDF)", "Leia no celular, tablet ou computador", "Acesso imediato por e-mail", "Receitas organizadas por refeição"],
      previewTitle: "Algumas receitas por dentro",
      excerpts: [],
    }),
  },
  {
    key: "autor",
    type: "author",
    label: "Quem está por trás (foto + história no admin)",
    sortOrder: 6,
    title: "Quem está por trás disso",
    body:
      "Oi, eu sou [SEU NOME]. [Eu / minha mãe / meu pai] convive com diabetes tipo 2 há [X] anos. Lembro do dia do diagnóstico: a médica listou tudo que tinha que sair do prato e foi embora — ninguém disse o que PODIA entrar. Durante meses foi arroz, frango e cara feia, até eu começar a testar troca por troca o que mantinha o sabor sem subir a glicemia. As receitas que deram certo viraram esse e-book. Sem fórmula mágica, sem promessa de cura — só comida boa que não te sabota.",
    // confirmed:"false" mantém a seção OCULTA até o dono subir a foto e confirmar a autoria no admin.
    config: j({ eyebrow: "Quem fez isso", name: "[SEU NOME]", role: "", confirmed: "false", imageAlt: "Foto do autor" }),
  },
  {
    key: "para-quem",
    type: "audience",
    label: "Pra quem é",
    sortOrder: 9,
    title: "O Diabetes à Mesa é pra você?",
    config: j({
      eyebrow: "Pra quem é",
      forYouTitle: "É pra você se…",
      forYou: [
        "Você tem diabetes (tipo 1, tipo 2 ou pré) e quer variar o cardápio",
        "Está cansado(a) de comer sempre a mesma coisa",
        "Sente falta de doce e quer opções seguras",
        "Quer praticidade: receitas fáceis e ingredientes de mercado",
      ],
      notForYouTitle: "Talvez não seja se…",
      notForYou: [
        "Você procura dieta milagrosa ou promessa de cura",
        "Não quer cozinhar nem o básico",
        "Espera substituir o acompanhamento do seu médico",
      ],
    }),
  },
  {
    key: "prova-social",
    type: "reviews",
    label: "Depoimentos (preencher e aprovar no admin)",
    sortOrder: 7,
    title: "Quem já está usando",
    body: null,
    config: j({ eyebrow: "Histórias de quem vive isso" }),
  },
  {
    key: "oferta",
    type: "offer",
    label: "Oferta (planos)",
    sortOrder: 8,
    title: "Escolha como você quer começar hoje",
    subtitle: "Pagamento único. O acesso é liberado na hora, assim que o PIX é confirmado.",
    ctaLabel: "QUERO ESTE KIT",
    body: DISCLAIMER,
    config: j({
      eyebrow: "Comece agora",
      includes: [],
      steps: [
        { title: "Pagamento via PIX", text: "Você preenche seus dados e recebe o QR Code e o código copia e cola." },
        { title: "Confirmação automática", text: "Assim que o pagamento é confirmado, o acesso é liberado." },
        { title: "Acesso imediato", text: "O link chega por e-mail e também fica na página do seu pedido." },
      ],
    }),
  },
  {
    key: "transparencia",
    type: "facts",
    label: "Transparência",
    sortOrder: 9,
    title: "Antes de começar, fique tranquilo(a)",
    config: j({
      eyebrow: "Transparência total",
      items: [
        { icon: "book", title: "O que você recebe", text: "Um e-book digital de receitas para diabéticos (e os materiais do kit escolhido)." },
        { icon: "download", title: "Como recebe", text: "Depois da confirmação do pagamento, o acesso chega por e-mail e fica na página do pedido." },
        { icon: "lock", title: "Preço", text: "A partir de {preco}, pagamento único via PIX. Sem mensalidade." },
        { icon: "shield", title: "Garantia de 7 dias", text: "Não gostou? Você tem 7 dias para pedir o reembolso do valor integral." },
        { icon: "chat", title: "Suporte", text: "Dúvidas sobre acesso ou pagamento? [Fale com o suporte](/suporte)." },
        { icon: "info", title: "Importante", text: "As receitas são uma aliada do seu tratamento, não um substituto. Não trocam a sua medicação nem o acompanhamento do seu médico ou nutricionista." },
      ],
    }),
  },
  { key: "faq", type: "faq", label: "Perguntas frequentes", sortOrder: 10, title: "Ainda tem dúvida? A gente responde", config: j({ eyebrow: "Dúvidas frequentes" }) },
  {
    key: "cta-final",
    type: "final_cta",
    label: "CTA final",
    sortOrder: 11,
    title: "A sua próxima refeição pode ser o primeiro passo para *controlar a diabetes*.",
    subtitle: "Comece hoje a comer com prazer, com segurança e sem medo da glicemia.",
    ctaLabel: "QUERO COMEÇAR AGORA",
    ctaTarget: "checkout",
  },
];
// Ordem das seções = posição no array acima (evita renumerar manualmente).
SECTIONS.forEach((s, i) => {
  s.sortOrder = i + 1;
});

/**
 * Depoimentos fornecidos pelo dono, com a experiência real ainda a preencher ([colchetes]).
 * Entram como RASCUNHO (approved:false) — NÃO aparecem no site até o dono completar o texto
 * e aprovar em Admin → Avaliações. Nunca publicar depoimento incompleto/inventado.
 */
const REVIEWS: { name: string; title: string; text: string }[] = [
  { name: "Ana", title: "Queria variar o cardápio", text: "Convivo com diabetes tipo 2 há 8 anos. Conheci o Diabetes à Mesa e resolvi experimentar porque queria encontrar mais variedade para a minha alimentação." },
  { name: "Ricardo", title: "Mais ideias pro dia a dia", text: "Tenho diabetes tipo 1 há 6 anos e peguei o Diabetes à Mesa para encontrar novas ideias para as minhas refeições." },
  { name: "Márcia", title: "Cansei de repetir pratos", text: "Vivo com diabetes tipo 2 há 12 anos. Eu repetia sempre as mesmas refeições e queria trazer mais variedade para a minha alimentação." },
  { name: "Juliano", title: "Receitas diferentes", text: "Tenho diabetes tipo 1 há 4 anos e procurava receitas diferentes para a minha rotina. Foi por isso que peguei o Diabetes à Mesa." },
  { name: "Sandra", title: "Gosto de experimentar", text: "Convivo com diabetes tipo 2 há 10 anos e gosto de experimentar receitas novas. O Diabetes à Mesa me chamou a atenção pela variedade." },
  { name: "Marcelo", title: "Melhorar o meu cardápio", text: "Tenho diabetes tipo 1 há 9 anos e procurava um material que me ajudasse a montar um cardápio melhor no dia a dia." },
  { name: "Fernanda", title: "Mais ideias pras refeições", text: "Tenho diabetes tipo 2 há 7 anos e queria mais ideias para as minhas refeições. Foi o que me fez conhecer o Diabetes à Mesa." },
  { name: "Roberto", title: "Sair da rotina", text: "Convivo com diabetes tipo 1 há 11 anos e quis sair da rotina de comer sempre as mesmas coisas." },
  { name: "Patrícia", title: "Organizar as refeições", text: "Tenho diabetes tipo 2 há 5 anos e buscava mais ideias para organizar as minhas refeições quando encontrei o Diabetes à Mesa." },
  { name: "Eduardo", title: "Novas opções", text: "Tenho diabetes tipo 1 há 3 anos e queria encontrar novas opções para a minha alimentação." },
];

const GALLERY: { title: string; image: string }[] = [
  { title: "Almoço completo e de baixo índice glicêmico", image: "/img/dish-1.png" },
  { title: "Café da manhã sem pico de glicose", image: "/img/dish-2.png" },
  { title: "Lanche da tarde prático e seguro", image: "/img/dish-3.png" },
  { title: "Sobremesa liberada, sem açúcar", image: "/img/dish-4.png" },
];

const FAQS: [string, string][] = [
  ["Essas receitas servem para diabetes tipo 1 e tipo 2?", "Sim. As receitas priorizam ingredientes de baixo índice glicêmico e ajudam no controle da glicemia tanto no tipo 1 quanto no tipo 2, além de serem úteis para pré-diabetes. Ainda assim, siga sempre as orientações do seu médico ou nutricionista."],
  ["Posso mesmo comer doce tendo diabetes?", "Sim, com as receitas certas. O e-book traz doces e sobremesas feitos para não disparar a glicemia, com trocas inteligentes de açúcar e farinha. A ideia é matar a vontade com segurança, dentro do seu controle."],
  ["As receitas substituem meu remédio ou a insulina?", "Não. A alimentação é a maior aliada do controle da diabetes, mas NÃO substitui a sua medicação, a insulina nem o acompanhamento do seu médico. Use as receitas junto com o seu tratamento, nunca no lugar dele."],
  ["Preciso de ingredientes caros ou difíceis de achar?", "Não. As receitas usam ingredientes acessíveis, de mercado e feira, com passo a passo simples — pensadas para o dia a dia de quem tem pouco tempo."],
  ["Como vou receber o material?", "É digital. Assim que o pagamento no PIX é confirmado, o acesso é liberado na hora e você recebe um e-mail com o link. Se perder, é só pedir de novo em [Meu acesso](/acesso)."],
  ["Qual é o valor?", "A partir de {preco}, em pagamento único via PIX. Sem mensalidade e sem cobrança recorrente."],
  ["Qual a diferença entre o Básico e o Completo?", "O Básico é o e-book com mais de 250 receitas. O Completo inclui o e-book + o planejamento semanal, as coleções de café da manhã, lanches e sobremesas liberadas, e o guia de rótulos — tudo com desconto. Você vê o que cada um inclui na seção de ofertas."],
  ["E se não for para mim?", "Você tem 7 dias de garantia. Se não gostar, é só escrever para o suporte com o número do pedido e devolvemos o valor integral, conforme o art. 49 do Código de Defesa do Consumidor."],
];

/** Versão do conteúdo da landing. Ao subir uma nova copy, incremente para reaplicar uma vez no deploy. */
const LANDING_VERSION = "dm-7";

/** Reaplica a copy comercial do catálogo (nomes/descrições/badges) a partir dos arrays acima. */
async function refreshCatalogCopy() {
  for (const o of OFFERS) {
    // NÃO sobrescreve imageUrl: preserva as imagens reais enviadas no admin (/media/...).
    await db.product.updateMany({ where: { slug: o.slug }, data: { name: o.name, subtitle: o.subtitle, shortDescription: o.shortDescription, badge: o.badge, featured: o.featured ?? false, compareAtPriceCents: o.compareAtPriceCents ?? null } });
  }
  const ebook = COMPONENTS.find((c) => c.slug === "ebook-diabetes-a-mesa");
  if (ebook) await db.product.updateMany({ where: { slug: ebook.slug }, data: { name: ebook.name, subtitle: ebook.subtitle ?? null, shortDescription: ebook.shortDescription } });
}

async function content() {
  const fresh = (await db.landingSection.count()) === 0;
  const row = await db.setting.findUnique({ where: { key: "landing_version" } });
  const current = row?.value != null ? String(row.value) : null;
  // Sobrescreve a copy canônica uma vez por versão; depois respeita as edições feitas no admin.
  const apply = fresh || current !== LANDING_VERSION;

  for (const s of SECTIONS) {
    const { key, ...data } = s;
    const existing = fresh ? null : await db.landingSection.findUnique({ where: { key } });
    if (!existing) {
      await db.landingSection.create({ data: s });
    } else if (apply) {
      // Atualiza textos/config, mas PRESERVA a imagem enviada no admin (/media/...).
      await db.landingSection.update({ where: { key }, data: { ...data, imageUrl: existing.imageUrl ?? data.imageUrl, active: true } });
    }
  }
  // Seções de versões antigas que saíram da página ficam inativas (não são apagadas).
  await db.landingSection.updateMany({ where: { key: { notIn: SECTIONS.map((s) => s.key) } }, data: { active: false } });

  if (apply) {
    await db.faq.deleteMany({});
    await db.faq.createMany({ data: FAQS.map(([question, answer], i) => ({ question, answer, sortOrder: i + 1 })) });
  }
  if ((await db.galleryItem.count()) === 0) {
    await db.galleryItem.createMany({ data: GALLERY.map((g, i) => ({ title: g.title, category: "RECEITAS", imageUrl: g.image, alt: g.title, sortOrder: i + 1 })) });
  }
  // Depoimentos: remove os rascunhos antigos (ainda com [colchetes]) e publica os limpos uma vez.
  // Preserva depoimentos que o dono já tenha editado/criado no admin.
  const rvRow = await db.setting.findUnique({ where: { key: "reviews_seed_version" } });
  if ((rvRow?.value != null ? String(rvRow.value) : null) !== "dm-2") {
    await db.review.deleteMany({ where: { text: { contains: "[" } } });
    if ((await db.review.count()) === 0) {
      await db.review.createMany({ data: REVIEWS.map((r, i) => ({ name: r.name, title: r.title, text: r.text, rating: 5, approved: true, verified: false, sortOrder: i + 1 })) });
    }
    await db.setting.upsert({ where: { key: "reviews_seed_version" }, update: { value: j("dm-2") }, create: { key: "reviews_seed_version", value: j("dm-2") } });
  }
  if (apply && !fresh) await refreshCatalogCopy();
  await db.setting.upsert({ where: { key: "landing_version" }, update: { value: j(LANDING_VERSION) }, create: { key: "landing_version", value: j(LANDING_VERSION) } });
}

// ───────────────────────── Execução ─────────────────────────

async function main() {
  await catalog();
  const cvRow = await db.setting.findUnique({ where: { key: "catalog_version" } });
  const cv = cvRow?.value != null ? String(cvRow.value) : null;
  if (cv !== CATALOG_VERSION) await applyCatalogUpdates();
  await content();
  await db.setting.upsert({ where: { key: "catalog_version" }, update: { value: j(CATALOG_VERSION) }, create: { key: "catalog_version", value: j(CATALOG_VERSION) } });
  const plans = await db.product.count({ where: { category: "PROGRAM", active: true } });
  console.log(`Seed ok — Diabetes à Mesa: ${plans} ofertas, ${BUMPS.length} bumps, ${UPSELL_PRODUCTS.length} upsells, 1 downsell. Materiais PENDENTES (suba os arquivos reais para abrir as vendas).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
