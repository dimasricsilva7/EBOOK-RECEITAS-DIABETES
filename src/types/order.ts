export type PublicOrderItem = {
  name: string;
  kind: "PRODUCT" | "ORDER_BUMP" | "UPSELL" | "CROSS_SELL";
  quantity: number;
  unitPriceCents: number;
  totalPriceCents: number;
};

/** Material liberado na página do pedido (link de download protegido pelo token do acesso). */
export type PublicDeliveredMaterial = {
  id: string;
  title: string;
  description: string | null;
  howToUse: string | null;
  format: string;
  /** "file" baixa/abre o arquivo; "link" abre o conteúdo externo */
  source: string;
  fileName: string | null;
  fileSize: number | null;
  href: string;
};

export type PublicDigitalAccess = {
  name: string;
  token: string;
  available: boolean;
  note: string | null;
  downloads: number;
  maxDownloads: number | null;
  expiresAt: string | null;
  materials: PublicDeliveredMaterial[];
  /** Materiais ainda em produção (anunciados como "em preparação", nunca como disponíveis) */
  pendingCount: number;
};

export type PublicUpsell = {
  id: string;
  /** "upsell" (padrão) ou "downsell" — define qual endpoint o cliente chama ao aceitar/recusar */
  kind?: "upsell" | "downsell";
  headline: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  productName: string;
  priceCents: number;
  listPriceCents: number | null;
  position: number;
};

export type PublicOrder = {
  orderNumber: string;
  status: string;
  paymentMethod: string;
  crediario: { methodLabel: string; installmentLabel: string } | null;
  source: "STOREFRONT" | "UPSELL";
  parent: { orderNumber: string; token: string } | null;
  totalCents: number;
  subtotalCents: number;
  discountCents: number;
  couponCode: string | null;
  pixCopyPaste: string | null;
  pixExpiresAt: string | null;
  paidAt: string | null;
  createdAt: string;
  metaEventId: string | null;
  customerFirstName: string;
  pixError: boolean;
  items: PublicOrderItem[];
  digital: PublicDigitalAccess[];
  /** Pedidos complementares (upsell) deste pedido, para acessar a partir da página principal */
  children: { orderNumber: string; token: string; status: string; name: string }[];
};
