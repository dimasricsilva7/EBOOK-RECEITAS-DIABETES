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
    name: "E-book Diabetes à Mesa (100+ receitas)",
    category: "EBOOK",
    priceCents: 3790,
    subtitle: "Mais de 100 receitas práticas e variadas",
    shortDescription: "O e-book principal, com mais de 100 receitas organizadas por refeição: café da manhã, almoço, jantar, lanches e sobremesas.",
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
    subtitle: "O ponto de partida",
    shortDescription: "O e-book Diabetes à Mesa com mais de 100 receitas práticas e variadas para todas as refeições do dia.",
    priceCents: 3790,
    sortOrder: 1,
    image: "/img/ebook-cover.png",
    includes: ["ebook-diabetes-a-mesa"],
  },
  {
    slug: "kit-pratica",
    sku: "DM-OF-PRA",
    name: "Kit Receitas + Organização",
    badge: "Prática",
    subtitle: "Receitas + organização da rotina",
    shortDescription: "O e-book completo mais o planejamento semanal e o guia de rótulos, para facilitar as compras e a rotina.",
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
    badge: "Mais vantajoso",
    subtitle: "Tudo o que você precisa, em um só kit",
    shortDescription: "O e-book, o planejamento semanal, as coleções de café da manhã, lanches e sobremesas, e o guia de rótulos.",
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
    title: "Receitas que cabem na sua rotina e respeitam a sua *alimentação*.",
    subtitle:
      "Conviver com diabetes não precisa significar comida sem graça ou os mesmos pratos de sempre.\n\nO Diabetes à Mesa reúne mais de 100 receitas práticas, variadas e organizadas por refeição — para você variar o cardápio com mais tranquilidade no dia a dia.",
    imageUrl: "/img/hero.png",
    ctaLabel: "Quero as receitas",
    ctaTarget: "checkout",
    config: j({ eyebrow: "E-book digital de receitas", badges: ["Mais de 100 receitas", "Pagamento via PIX", "Acesso imediato por e-mail", "Leia no celular"], imageAlt: "Mesa com pratos coloridos e equilibrados" }),
  },
  {
    key: "identificacao",
    type: "identification",
    label: "Identificação (cards)",
    sortOrder: 2,
    title: "Talvez você se identifique com isso",
    subtitle: "No dia a dia, montar refeições variadas e práticas pode virar um desafio.",
    body: "Organização e variedade deixam a rotina na cozinha mais leve.",
    config: j({
      eyebrow: "Soa familiar?",
      items: [
        { icon: "spiral", title: "Fica sem ideias e acaba repetindo os mesmos pratos.", text: "A rotina aperta e o cardápio vira sempre o mesmo." },
        { icon: "clock", title: "Falta tempo para planejar as refeições da semana.", text: "Na correria, decidir o que comer vira mais um peso." },
        { icon: "info", title: "Fica em dúvida na hora de ler os rótulos no mercado.", text: "Tantos nomes e números deixam a escolha confusa." },
        { icon: "heart", title: "Quer variar sem complicar.", text: "Comida gostosa e prática, sem receita difícil." },
      ],
    }),
  },
  {
    key: "topicos",
    type: "topics",
    label: "O que você encontra",
    sortOrder: 3,
    title: "O que você encontra no Diabetes à Mesa",
    subtitle: "Um e-book de culinária pensado para a vida real.",
    body: "Receitas organizadas por refeição, com ingredientes acessíveis e modo de preparo direto ao ponto.",
    config: j({
      eyebrow: "Por dentro do conteúdo",
      items: [
        { icon: "book", title: "Mais de 100 receitas", text: "Café da manhã, almoço, jantar, lanches e sobremesas." },
        { icon: "compass", title: "Organizado por refeição", text: "Ache rápido o que preparar em cada momento do dia." },
        { icon: "clock", title: "Preparo prático", text: "Passo a passo direto e ingredientes acessíveis." },
        { icon: "leaf", title: "Variedade no cardápio", text: "Ideias para fugir da mesmice e montar pratos diferentes." },
        { icon: "pen", title: "Planejamento opcional", text: "Materiais de organização semanal para quem quiser ir além." },
      ],
    }),
  },
  {
    key: "produto",
    type: "showcase",
    label: "Por dentro do e-book (galeria)",
    sortOrder: 4,
    title: "Veja como o e-book é por dentro",
    body: "O Diabetes à Mesa é um e-book digital. Depois da confirmação do pagamento, o acesso chega por e-mail e você lê no celular, tablet ou computador.",
    imageUrl: "/img/showcase.png",
    ctaLabel: "Quero o e-book",
    ctaTarget: "checkout",
    config: j({
      eyebrow: "Por dentro do e-book",
      imageAlt: "E-book Diabetes à Mesa aberto no tablet e no celular",
      formatItems: ["E-book digital (PDF)", "Leia no celular, tablet ou computador", "Acesso por e-mail após o pagamento", "Receitas organizadas por refeição"],
      previewTitle: "Algumas receitas por dentro",
      excerpts: [],
    }),
  },
  {
    key: "oferta",
    type: "offer",
    label: "Oferta (planos)",
    sortOrder: 5,
    title: "Escolha o seu kit",
    subtitle: "Um único pagamento. O acesso é liberado após a confirmação do pagamento.",
    ctaLabel: "Quero este kit",
    body: DISCLAIMER,
    config: j({
      eyebrow: "Ofertas",
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
    sortOrder: 6,
    title: "Tudo o que você precisa saber antes de comprar",
    config: j({
      eyebrow: "Transparência",
      items: [
        { icon: "book", title: "O que você compra", text: "Um e-book digital de receitas (e os materiais do kit escolhido). Conteúdo de culinária — não é consulta nem plano alimentar individual." },
        { icon: "download", title: "Como recebe", text: "Depois da confirmação do pagamento, o acesso chega por e-mail e fica na página do pedido." },
        { icon: "lock", title: "Preço", text: "A partir de {preco}, pagamento único via PIX. Sem mensalidade." },
        { icon: "chat", title: "Suporte", text: "Dúvidas sobre acesso ou pagamento? [Fale com o suporte](/suporte)." },
        { icon: "shield", title: "Termos e privacidade", text: "Consulte os [termos](/termos), a [privacidade](/politica-de-privacidade) e o [reembolso](/trocas-e-devolucoes)." },
        { icon: "info", title: "Importante", text: "Material educativo de culinária. Não trata nem cura diabetes e não substitui acompanhamento médico ou nutricional." },
      ],
    }),
  },
  { key: "faq", type: "faq", label: "Perguntas frequentes", sortOrder: 7, title: "Perguntas frequentes", config: j({ eyebrow: "Dúvidas" }) },
  {
    key: "cta-final",
    type: "final_cta",
    label: "CTA final",
    sortOrder: 8,
    title: "Leve mais variedade e praticidade para a *sua mesa*.",
    subtitle: "Receitas organizadas, fáceis de preparar e pensadas para o dia a dia de quem convive com diabetes.",
    ctaLabel: "Quero as receitas",
    ctaTarget: "checkout",
  },
];

const GALLERY: { title: string; image: string }[] = [
  { title: "Almoço colorido e equilibrado", image: "/img/dish-1.png" },
  { title: "Café da manhã prático", image: "/img/dish-2.png" },
  { title: "Lanche rápido do dia a dia", image: "/img/dish-3.png" },
  { title: "Sobremesa para explorar", image: "/img/dish-4.png" },
];

const FAQS: [string, string][] = [
  ["O que é o Diabetes à Mesa?", "É um e-book digital de culinária com mais de 100 receitas práticas e variadas, organizadas por refeição, para quem convive com diabetes e quer variar o cardápio no dia a dia. É um material educativo de culinária."],
  ["O e-book trata ou cura diabetes?", "Não. O Diabetes à Mesa é um material educativo de culinária. Ele não é tratamento, não cura diabetes e não garante controle da glicemia. As receitas não substituem o acompanhamento do seu médico ou nutricionista — consulte sempre o seu profissional de saúde antes de mudar sua alimentação."],
  ["Qual a diferença entre os kits?", "O kit Essencial traz o e-book de receitas. O Prática acrescenta o planejamento semanal e o guia de rótulos. O Completa inclui também as coleções de café da manhã, lanches e sobremesas. Você vê o que cada um inclui na seção de ofertas."],
  ["Como funciona o acesso?", "Depois que o pagamento é confirmado, o acesso é liberado automaticamente e você recebe um e-mail com o link. Se perder o link, peça um novo em [Meu acesso](/acesso)."],
  ["Como funciona o pagamento?", "Por PIX. O QR Code e o código copia e cola aparecem logo após você preencher seus dados, e a confirmação é automática."],
  ["Qual é o valor?", "A partir de {preco}, em pagamento único. Não há mensalidade nem cobrança recorrente."],
  ["Preciso saber cozinhar bem?", "Não. As receitas têm passo a passo direto e ingredientes acessíveis, pensadas para o dia a dia — inclusive para quem tem pouco tempo."],
  ["E se eu me arrepender?", "Você pode desistir da compra em até 7 dias após o pagamento e receber o valor de volta, conforme o art. 49 do Código de Defesa do Consumidor. É só escrever para o suporte informando o número do pedido."],
  ["Como falo com o suporte?", "Pela página [Suporte](/suporte). Respondemos pelo e-mail que você informar."],
];

async function content() {
  for (const s of SECTIONS) await db.landingSection.upsert({ where: { key: s.key }, update: {}, create: s });
  if ((await db.faq.count()) === 0) await db.faq.createMany({ data: FAQS.map(([question, answer], i) => ({ question, answer, sortOrder: i + 1 })) });
  if ((await db.galleryItem.count()) === 0) await db.galleryItem.createMany({ data: GALLERY.map((g, i) => ({ title: g.title, category: "RECEITAS", imageUrl: g.image, alt: g.title, sortOrder: i + 1 })) });
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
