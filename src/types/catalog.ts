import type { GalleryImage, ProductSpec } from "@/lib/domain";

export type ProductCategoryKey = "PROGRAM" | "EBOOK" | "JOURNAL" | "AUDIO" | "VIDEO" | "BONUS" | "OTHER";
export type MaterialFormatKey = "PDF" | "VIDEO" | "AUDIO" | "WORKBOOK" | "LINK" | "OTHER";

/** Material pronto (status READY) exibido na landing — nunca inclui arquivo ou link privado. */
export type PublicMaterial = {
  id: string;
  title: string;
  description: string | null;
  howToUse: string | null;
  purpose: string | null;
  format: MaterialFormatKey;
  coverUrl: string | null;
};

export type PublicProduct = {
  id: string;
  slug: string;
  sku: string;
  name: string;
  subtitle: string | null;
  category: ProductCategoryKey;
  fulfillment: "DIGITAL";
  shortDescription: string | null;
  description: string | null;
  priceCents: number;
  listPriceCents: number | null;
  promoLabel: string | null;
  promoEndsAt: string | null;
  specs: ProductSpec[];
  imageUrl: string | null;
  gallery: GalleryImage[];
  videoUrl: string | null;
  badge: string | null;
  featured: boolean;
  crossSellIds: string[];
  includedProductIds: string[];
  deliveryFormat: string | null;
  digitalDeliveryNote: string | null;
  sortOrder: number;
  seoTitle: string | null;
  seoDescription: string | null;
};

export type QuoteLine = {
  productId: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  category: ProductCategoryKey;
  fulfillment: "DIGITAL";
  quantity: number;
  unitPriceCents: number;
  listPriceCents: number | null;
  totalCents: number;
  kind: "PRODUCT" | "ORDER_BUMP" | "CROSS_SELL";
  orderBumpId?: string;
};

export type QuoteBump = {
  id: string;
  productId: string;
  title: string;
  description: string | null;
  benefit: string | null;
  imageUrl: string | null;
  priceCents: number;
  listPriceCents: number | null;
  selected: boolean;
  /** Oferta em destaque: modal com imagem antes de gerar o PIX */
  showModal: boolean;
  modalTitle: string | null;
  productName: string;
  discountPct: number | null;
};

export type CartQuote = {
  lines: QuoteLine[];
  bumps: QuoteBump[];
  crossSells: PublicProduct[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  coupon: { code: string; valid: boolean; message: string | null } | null;
  removed: string[];
};
