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
    name: "E-book Diabetes à Mesa (200+ receitas)",
    category: "EBOOK",
    priceCents: 3790,
    subtitle: "Mais de 200 receitas para controlar a diabetes",
    shortDescription: "O e-book principal, com mais de 200 receitas de baixo índice glicêmico organizadas por refeição: café da manhã, almoço, jantar, lanches e sobremesas liberadas.",
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
    badge: "Essencial",
    subtitle: "Comece por aqui",
    shortDescription: "O e-book com mais de 200 receitas para diabéticos: café da manhã, almoço, jantar, lanches e sobremesas liberadas, todas de baixo índice glicêmico.",
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
    badge: "Melhor custo-benefício",
    subtitle: "Tudo para controlar a diabetes comendo bem",
    shortDescription: "O pacote completo: e-book + planejamento semanal + coleções de café da manhã, lanches e sobremesas liberadas + guia de rótulos. Tudo para comer bem e cuidar da glicemia.",
    priceCents: 7990,
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
    active: true,
    sortOrder: 1,
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

/** Downsell vinculado ao upsell "30 dias": uma versão compacta de 7 dias. */
const DOWNSELL = {
  forUpsellSlug: "organizador-cardapio-30",
  product: {
    slug: "organizador-cardapio-7",
    sku: "DM-DOWN-ORG7",
    name: "Organizador de Cardápio para 7 Dias",
    category: "JOURNAL" as ProductCategory,
    priceCents: 1790,
    shortDescription: "Uma versão compacta do organizador: o planejamento e a lista de compras de uma semana.",
    material: { title: "Organizador de Cardápio — 7 Dias", description: "Planejamento e lista de compras de uma semana.", howToUse: "Planeje a semana e leve a lista ao mercado.", format: "WORKBOOK" as const },
  },
  headline: "Prefere começar com uma semana?",
  title: "Organizador de Cardápio para 7 Dias",
  description: "Uma versão compacta do organizador, com o planejamento e a lista de compras de uma semana — ideal para testar no seu ritmo.",
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

async function catalog() {
  const bySlug = new Map<string, string>();
  for (const c of COMPONENTS) {
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
    title: "Mais de *200 receitas* que ajudam a controlar a diabetes — sem passar vontade.",
    subtitle:
      "Café da manhã, almoço, jantar, lanches e até sobremesas: pratos saborosos e fáceis, pensados para ajudar a manter a sua glicemia sob controle no dia a dia.\n\nChega de arroz com frango sem graça e de cortar tudo o que você gosta. Dá, sim, para comer bem e cuidar da diabetes ao mesmo tempo.",
    imageUrl: "/img/hero-mockup.png",
    ctaLabel: "QUERO COMER BEM E CONTROLAR A DIABETES",
    ctaTarget: "checkout",
    config: j({ eyebrow: "Receitas para quem tem diabetes", badges: ["Baixo índice glicêmico", "Uma receita por refeição", "Doces liberados", "Acesso imediato"], imageAlt: "E-book Diabetes à Mesa no celular e no tablet" }),
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
    key: "doces",
    type: "method",
    label: "Sim, você pode comer doce",
    sortOrder: 3,
    title: "Sim, você pode comer doce tendo diabetes.",
    subtitle: "A questão nunca foi parar de comer doce. Foi aprender a fazer o doce certo.",
    body: "São doces de verdade, feitos para quem precisa controlar o açúcar no sangue — sem aquele gosto de adoçante e sem receita impossível.",
    config: j({
      eyebrow: "A parte que você mais vai gostar",
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
    key: "oferta",
    type: "offer",
    label: "Oferta (planos)",
    sortOrder: 6,
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
    sortOrder: 7,
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
  { key: "faq", type: "faq", label: "Perguntas frequentes", sortOrder: 8, title: "Ainda tem dúvida? A gente responde", config: j({ eyebrow: "Dúvidas frequentes" }) },
  {
    key: "cta-final",
    type: "final_cta",
    label: "CTA final",
    sortOrder: 9,
    title: "A sua próxima refeição pode ser o primeiro passo para *controlar a diabetes*.",
    subtitle: "Comece hoje a comer com prazer, com segurança e sem medo da glicemia.",
    ctaLabel: "QUERO COMEÇAR AGORA",
    ctaTarget: "checkout",
  },
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
  ["Qual a diferença entre os kits?", "O Essencial traz o e-book de receitas. O Prática acrescenta o planejamento semanal e o guia de rótulos. O Completa inclui ainda as coleções de café da manhã, lanches e sobremesas. Você vê o que cada um inclui na seção de ofertas."],
  ["E se não for para mim?", "Você tem 7 dias de garantia. Se não gostar, é só escrever para o suporte com o número do pedido e devolvemos o valor integral, conforme o art. 49 do Código de Defesa do Consumidor."],
];

/** Versão do conteúdo da landing. Ao subir uma nova copy, incremente para reaplicar uma vez no deploy. */
const LANDING_VERSION = "dm-2";

/** Reaplica a copy comercial do catálogo (nomes/descrições/badges) a partir dos arrays acima. */
async function refreshCatalogCopy() {
  for (const o of OFFERS) {
    await db.product.updateMany({ where: { slug: o.slug }, data: { name: o.name, subtitle: o.subtitle, shortDescription: o.shortDescription, badge: o.badge, featured: o.featured ?? false, imageUrl: o.image, compareAtPriceCents: o.compareAtPriceCents ?? null } });
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
    if (fresh) {
      await db.landingSection.create({ data: s });
    } else {
      const { key, ...data } = s;
      await db.landingSection.upsert({ where: { key }, update: apply ? data : {}, create: s });
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
  if (apply && !fresh) await refreshCatalogCopy();
  await db.setting.upsert({ where: { key: "landing_version" }, update: { value: j(LANDING_VERSION) }, create: { key: "landing_version", value: j(LANDING_VERSION) } });
}

// ───────────────────────── Execução ─────────────────────────

async function main() {
  await catalog();
  await content();
  await db.setting.upsert({ where: { key: "catalog_version" }, update: { value: j("dm-1") }, create: { key: "catalog_version", value: j("dm-1") } });
  const plans = await db.product.count({ where: { category: "PROGRAM", active: true } });
  console.log(`Seed ok — Diabetes à Mesa: ${plans} ofertas, ${BUMPS.length} bumps, ${UPSELL_PRODUCTS.length} upsells, 1 downsell. Materiais PENDENTES (suba os arquivos reais para abrir as vendas).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
