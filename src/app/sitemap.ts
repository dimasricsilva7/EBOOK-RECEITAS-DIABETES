import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/env";

export const revalidate = 3600;

/** Só rotas que existem: quiz (entrada), página do e-book e páginas institucionais. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  return [
    { url: base, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/e-book`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/suporte`, changeFrequency: "yearly", priority: 0.3 },
    ...["politica-de-privacidade", "termos", "trocas-e-devolucoes", "cookies"].map((s) => ({ url: `${base}/${s}`, changeFrequency: "yearly" as const, priority: 0.2 })),
  ];
}
