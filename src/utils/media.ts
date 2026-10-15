export const MEDIA_CATEGORIES = ["MARCA", "HERO", "PRODUTO", "MATERIAIS", "LANDING", "DEPOIMENTOS", "OFERTAS", "OUTROS"] as const;
export type MediaCategory = (typeof MEDIA_CATEGORIES)[number];

export const CATEGORY_LABEL: Record<string, string> = {
  MARCA: "Marca (logo, favicon)",
  HERO: "Primeira tela",
  PRODUTO: "Produto (capa)",
  MATERIAIS: "Capas dos materiais",
  LANDING: "Seções da landing",
  DEPOIMENTOS: "Depoimentos",
  OFERTAS: "Order bump / upsell",
  OUTROS: "Outros",
};

export const isMediaCategory = (v: unknown): v is MediaCategory => typeof v === "string" && (MEDIA_CATEGORIES as readonly string[]).includes(v);
