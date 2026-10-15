/**
 * Definições de domínio compartilhadas (cliente + servidor). Nada aqui contém
 * preço, texto comercial ou material — isso vive no banco e é editado no admin.
 */

// ───────────── Catálogo ─────────────

export const CATEGORY_LABEL = {
  PROGRAM: "Programa principal",
  EBOOK: "E-book / guia",
  JOURNAL: "Diário / caderno de exercícios",
  AUDIO: "Áudios",
  VIDEO: "Vídeos",
  BONUS: "Material complementar",
  OTHER: "Outros",
} as const;

export const MATERIAL_FORMAT_LABEL = {
  PDF: "PDF para baixar",
  VIDEO: "Vídeo",
  AUDIO: "Áudio",
  WORKBOOK: "Diário / exercícios (PDF)",
  LINK: "Acesso online (link)",
  OTHER: "Outro formato",
} as const;

export const MATERIAL_STATUS_LABEL = {
  PENDING: "Em produção (não anunciado)",
  READY: "Pronto para entrega",
  ARCHIVED: "Arquivado",
} as const;

export type ProductSpec = { label: string; value: string };
export type GalleryImage = { url: string; alt?: string };

// ───────────── Pedidos ─────────────

export const ORDER_STATUS_LABEL = {
  PENDING: "Aguardando PIX",
  PIX_GENERATED: "PIX gerado",
  PAID: "Pago · acesso liberado",
  CANCELLED: "Cancelado",
  EXPIRED: "PIX expirado",
  REFUNDED: "Reembolsado",
  CHARGEBACK: "Contestação",
  FAILED: "Falhou",
  CREDIARIO_PENDENTE: "Crediário pendente",
  CREDIARIO_EM_ANALISE: "Crediário em análise",
  CREDIARIO_APROVADO: "Crediário aprovado",
  CREDIARIO_RECUSADO: "Crediário recusado",
  CREDIARIO_CANCELADO: "Crediário cancelado",
} as const;
export type OrderStatusKey = keyof typeof ORDER_STATUS_LABEL;

export const PAYMENT_METHOD_LABEL = { PIX: "PIX", CREDIARIO: "Crediário" } as const;

/** Status em que o pagamento já foi confirmado (receita + acesso liberado). Crediário aprovado conta como pago. */
export const PAID_STATUSES = ["PAID", "CREDIARIO_APROVADO"] as const;
export const AWAITING_STATUSES = ["PENDING", "PIX_GENERATED"] as const;
export const isPaidStatus = (s: string) => (PAID_STATUSES as readonly string[]).includes(s);
export const isAwaitingStatus = (s: string) => (AWAITING_STATUSES as readonly string[]).includes(s);

/** Crediário: estados próprios (análise manual do protocolo pelo admin). */
export const CREDIARIO_STATUSES = ["CREDIARIO_PENDENTE", "CREDIARIO_EM_ANALISE", "CREDIARIO_APROVADO", "CREDIARIO_RECUSADO", "CREDIARIO_CANCELADO"] as const;
export type CrediarioStatus = (typeof CREDIARIO_STATUSES)[number];
export const isCrediarioStatus = (s: string) => (CREDIARIO_STATUSES as readonly string[]).includes(s);
export const isCrediarioPending = (s: string) => s === "CREDIARIO_PENDENTE" || s === "CREDIARIO_EM_ANALISE";

/** Transições permitidas do crediário. Aprovado libera o acesso digital pelo fluxo normal. */
export const CREDIARIO_TRANSITIONS: Record<CrediarioStatus, CrediarioStatus[]> = {
  CREDIARIO_PENDENTE: ["CREDIARIO_EM_ANALISE", "CREDIARIO_APROVADO", "CREDIARIO_RECUSADO", "CREDIARIO_CANCELADO"],
  CREDIARIO_EM_ANALISE: ["CREDIARIO_APROVADO", "CREDIARIO_RECUSADO", "CREDIARIO_CANCELADO", "CREDIARIO_PENDENTE"],
  CREDIARIO_APROVADO: ["CREDIARIO_CANCELADO"],
  CREDIARIO_RECUSADO: ["CREDIARIO_EM_ANALISE"],
  CREDIARIO_CANCELADO: [],
};

// ───────────── Galeria ─────────────

export const GALLERY_CATEGORIES = ["Rotina", "Autocuidado", "Materiais", "Bastidores", "Diversos"] as const;

// ───────────── Analytics ─────────────
// Eventos próprios. NUNCA contêm respostas do quiz ou qualquer inferência de saúde.

export const TRACKED_EVENTS = [
  "page_view",
  "landing_view",
  "scroll_25",
  "scroll_50",
  "scroll_75",
  "scroll_90",
  "video_start",
  "video_25",
  "video_50",
  "video_75",
  "video_complete",
  "gallery_open",
  "gallery_interaction",
  "faq_open",
  "quiz_view",
  "quiz_started",
  "quiz_step_completed",
  "quiz_lead_captured",
  "quiz_completed",
  "quiz_result_view",
  "result_viewed",
  "quiz_cta_click",
  "offer_view",
  "product_view",
  "kit_selected",
  "cta_click",
  "add_to_cart",
  "remove_from_cart",
  "cart_view",
  "checkout_started",
  "coupon_applied",
  "order_bump_view",
  "order_bump_accept",
  "order_bump_reject",
  "cross_sell_view",
  "cross_sell_add",
  "upsell_view",
  "upsell_accept",
  "upsell_reject",
  "downsell_view",
  "downsell_accept",
  "downsell_reject",
  "pix_generated",
  "pix_copy",
  "pix_renewed",
  "checkout_recovered",
  "crediario_started",
  "crediario_data_completed",
  "crediario_order_created",
  "crediario_pending",
  "crediario_in_review",
  "crediario_approved",
  "crediario_rejected",
  "crediario_cancelled",
  "pix_error",
  "payment_pending",
  "payment_paid",
  "purchase",
  "checkout_abandoned",
  "access_granted",
  "access_view",
  "digital_download",
  "access_resend_requested",
  "support_message",
  "email_confirmation_sent",
  "email_recovery_sent",
  "email_order_sent",
  "email_access_sent",
  "cookie_consent",
] as const;
export type TrackedEvent = (typeof TRACKED_EVENTS)[number];

/** Etapas do funil exibidas no admin (cada etapa = sessões com pelo menos um dos eventos). */
export const FUNNEL_STEPS: { key: string; label: string; events: TrackedEvent[] }[] = [
  { key: "visitors", label: "Visitantes", events: ["page_view", "landing_view", "quiz_view"] },
  { key: "quiz_start", label: "Iniciaram o quiz", events: ["quiz_started"] },
  { key: "quiz_done", label: "Concluíram o quiz", events: ["quiz_completed"] },
  { key: "lead", label: "Lead identificado", events: ["quiz_lead_captured"] },
  { key: "offer", label: "Visualizaram oferta", events: ["offer_view"] },
  { key: "cta", label: "Clicaram para comprar", events: ["add_to_cart", "kit_selected"] },
  { key: "checkout", label: "Checkout", events: ["checkout_started"] },
  { key: "pix", label: "PIX gerado", events: ["pix_generated"] },
  { key: "pix_copy", label: "PIX copiado", events: ["pix_copy"] },
  { key: "paid", label: "Pagamento aprovado", events: ["payment_paid"] },
  { key: "purchase", label: "Compra", events: ["purchase"] },
];

// ───────────── Landing page (CMS) ─────────────

export const SECTION_TYPES = {
  hero: "Primeira tela (hero)",
  identification: "Identificação",
  patterns: "Compreensão dos padrões",
  method: "Apresentação do método (pilares)",
  content: "Conteúdo incluído (materiais reais)",
  experience: "Como você acessa",
  video: "Vídeo",
  gallery: "Galeria de imagens",
  audience: "Para quem é / para quem não é",
  trust: "Confiança e credibilidade (autoria)",
  reviews: "Depoimentos reais (avaliações)",
  offer: "Oferta",
  limits: "Limites do produto (aviso importante)",
  faq: "Perguntas frequentes",
  final_cta: "CTA final",
  topics: "O que você encontrará no e-book (tópicos)",
  showcase: "Apresentação visual do produto",
  author: "Sobre a autora",
  cycle: "Ciclo interativo (etapas tocáveis)",
  facts: "Transparência (resumo da compra)",
} as const;
export type SectionType = keyof typeof SECTION_TYPES;

export type IconItem = { icon?: string; title: string; text?: string };

/** Ícones de linha disponíveis para pilares, benefícios e selos. */
export const ICONS = ["heart", "leaf", "sparkle", "compass", "eye", "pen", "book", "headphones", "play", "lock", "shield", "pix", "chat", "clock", "download", "check", "sun", "moon", "hand", "spiral"] as const;
export type IconName = (typeof ICONS)[number];
export const ICON_LABEL: Record<IconName, string> = {
  heart: "Coração / acolhimento",
  leaf: "Folha / leveza",
  sparkle: "Brilho / descoberta",
  compass: "Bússola / caminho",
  eye: "Olho / observar",
  pen: "Caneta / escrever",
  book: "Livro / guia",
  headphones: "Fone / áudio",
  play: "Play / vídeo",
  lock: "Cadeado / segurança",
  shield: "Escudo / proteção",
  pix: "PIX",
  chat: "Balão / suporte",
  clock: "Relógio / no seu tempo",
  download: "Download",
  check: "Visto",
  sun: "Sol / manhã",
  moon: "Lua / noite",
  hand: "Mão / cuidado",
  spiral: "Espiral / padrão",
};
/** Compatibilidade com nomes antigos usados em conteúdo salvo. */
export const PIXEL_ICONS = ICONS;
