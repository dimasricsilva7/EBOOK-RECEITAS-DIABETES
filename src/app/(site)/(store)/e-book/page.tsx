import type { Metadata } from "next";
import { Fragment } from "react";
import { Audience, Author, Compare, Content, Cycle, Facts, Experience, Faq, FinalCta, GallerySection, Hero, Identification, Limits, Method, Offer, Patterns, Reviews, Showcase, Stats, Topics, Trust, Video, type LandingCtx } from "@/components/landing/Sections";
import { cfgStr } from "@/server/landing";
import { LandingTracker, QuizWelcome, StickyMobileCTA } from "@/components/landing/client";
import { RecentPurchases } from "@/components/RecentPurchases";
import { valueFor } from "@/lib/experiments";
import { crediarioConfig, installmentOptions } from "@/lib/crediario";
import { bravopayMode, siteUrl } from "@/lib/env";
import { db } from "@/lib/db";
import { currentAssignments, getLandingMaterials, getPlans, getPublicCatalog, readyMaterialCount } from "@/server/catalog";
import { getApprovedReviews, getFaqs, getGallery, getLandingSections, loadLandingSectionsDirect, safeLoad, type SectionData } from "@/server/landing";
import { getPublishedQuiz } from "@/server/quiz";
import { getSettings, isOn } from "@/server/settings";
import { formatBRL } from "@/utils/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: "Diabetes à Mesa — receitas práticas e variadas para o dia a dia" },
  description: "E-book digital com receitas práticas, variadas e organizadas para quem convive com diabetes. Conteúdo educativo de culinária — não substitui acompanhamento médico ou nutricional.",
  alternates: { canonical: "/e-book" },
};

function orderSections(sections: SectionData[], override: string | null) {
  if (!override) return sections;
  const order = override.split(",").map((s) => s.trim());
  const rank = (k: string) => (order.includes(k) ? order.indexOf(k) : order.length + sections.findIndex((s) => s.key === k));
  return [...sections].sort((a, b) => rank(a.key) - rank(b.key));
}

/** Landing page: todo o conteúdo vem do CMS e dos materiais reais cadastrados no admin. */
export default async function LandingPage() {
  const assignments = await currentAssignments();
  // Cada leitura é independente: uma falha do banco nunca derruba a página inteira
  const [sectionsRaw, planList, gallery, faqs, reviews, s, quiz] = await Promise.all([
    safeLoad(getLandingSections, loadLandingSectionsDirect, []),
    getPlans(assignments).catch(() => []),
    safeLoad(getGallery, () => db.galleryItem.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }), []),
    safeLoad(getFaqs, () => db.faq.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }), []),
    safeLoad(getApprovedReviews, async () => [], []),
    getSettings(),
    getPublishedQuiz(),
  ]);
  const product = planList[0] ?? null;
  const fullCatalog = await getPublicCatalog(assignments).catch(() => []);
  const nameById = new Map(fullCatalog.map((p) => [p.id, p.name]));
  const planData = await Promise.all(planList.map(async (pl) => ({ product: pl, materials: await getLandingMaterials(pl.id).catch(() => []), ready: await readyMaterialCount(pl.id).catch(() => 0) })));
  const readyCount = planData.reduce((s, x) => s + x.ready, 0);
  // Conteúdo incluído: união dos materiais de todos os planos, indicando em quais planos cada um está
  const materials = [...new Map(planData.flatMap((x) => x.materials.map((m) => [m.id, m] as const))).values()].map((m) => ({
    ...m,
    plans: planData.filter((x) => x.materials.some((y) => y.id === m.id)).map((x) => x.product.name),
  }));

  const cfg = crediarioConfig(s);
  const lastInstallment = planList.at(-1) && cfg.enabled ? installmentOptions(planList.at(-1)!.priceCents, cfg).at(-1) : null;
  // Prova social: nota e total vêm do admin; se vazios, calcula pela média/quantidade reais cadastradas.
  const ratings = reviews.map((r) => r.rating).filter((n) => n > 0);
  const computedAvg = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
  const reviewStats =
    isOn(s.reviews_enabled ?? "true") && reviews.length
      ? {
          title: s.reviews_section_title || "Avaliações de clientes",
          rating: (s.reviews_rating || "").trim() || (computedAvg ? computedAvg.toFixed(1).replace(".", ",") : ""),
          count: (s.reviews_count || "").trim() || String(reviews.length),
          countLabel: s.reviews_count_label || "avaliações",
          verifiedLabel: s.reviews_verified_label || "Compra verificada",
          heroProof: (s.reviews_hero_proof || "").trim(),
        }
      : null;
  const ctx: LandingCtx = {
    product,
    // Conteúdo do kit = nomes dos produtos inclusos (descreve o bundle mesmo antes de os arquivos ficarem prontos)
    plans: planData.map((x) => {
      const includeTitles = (x.product.includedProductIds ?? []).map((id) => nameById.get(id)).filter((t): t is string => Boolean(t));
      return { ...x.product, materialTitles: includeTitles.length ? includeTitles : x.materials.map((m) => m.title), sellable: x.ready > 0 };
    }),
    planCount: planData.length,
    materials,
    faqs: faqs.map((f) => ({ id: f.id, question: f.question, answer: f.answer })),
    reviews: reviews.map((r) => ({ id: r.id, name: r.name, title: r.title, text: r.text, rating: r.rating, ageLabel: r.ageLabel, timeAgo: r.timeAgo, verified: r.verified, photoUrl: r.photoUrl })),
    reviewStats,
    gallery: gallery.map((g) => ({ id: g.id, title: g.title, imageUrl: g.imageUrl, alt: g.alt })),
    s,
    // Vendas abertas = chave ligada no admin + PIX/crediário disponível + material real pronto
    salesOpen: isOn(s.sales_enabled) && readyCount > 0 && ((isOn(s.pix_enabled) && bravopayMode() !== "disabled") || cfg.enabled),
    payment: { pix: isOn(s.pix_enabled), crediario: lastInstallment ? `parcelamento no ${cfg.methodLabel.toLowerCase()}` : null },
  };

  const sections = orderSections(sectionsRaw.filter((x) => x.active), valueFor(assignments, "section_order"));
  const RENDER: Record<string, (p: { section: SectionData; ctx: LandingCtx }) => React.ReactNode> = {
    hero: Hero,
    identification: Identification,
    patterns: Patterns,
    method: Method,
    content: Content,
    experience: Experience,
    video: Video,
    gallery: GallerySection,
    audience: Audience,
    trust: Trust,
    reviews: Reviews,
    offer: Offer,
    limits: Limits,
    faq: Faq,
    final_cta: FinalCta,
    topics: Topics,
    showcase: Showcase,
    author: Author,
    cycle: Cycle,
    facts: Facts,
    stats: Stats,
    compare: Compare,
  };
  // Âncoras para os botões e o menu (#como-funciona, #conteudo-do-ebook, #autora…); oferta e FAQ já têm id próprio
  const DEFAULT_ANCHOR: Record<string, string> = { identification: "identificacao", cycle: "como-funciona", topics: "conteudo-do-ebook", showcase: "por-dentro", author: "autora", method: "o-que-esperar", facts: "transparencia", audience: "para-quem" };
  const anchorFor = (x: SectionData) => (x.type === "offer" || x.type === "faq" ? "" : cfgStr(x.config, "anchor") || DEFAULT_ANCHOR[x.type] || "");
  const heroOverride = (x: SectionData): SectionData =>
    x.type === "hero" ? { ...x, title: valueFor(assignments, "hero_headline") ?? x.title, ctaLabel: valueFor(assignments, "hero_cta") ?? x.ctaLabel, imageUrl: valueFor(assignments, "hero_image") ?? x.imageUrl } : x;

  const resultTexts = Object.fromEntries((quiz?.data.results ?? []).map((r) => [r.key, { title: r.title, subtitle: r.subtitle }]));
  const base = siteUrl();
  const jsonLd = [
    { "@context": "https://schema.org", "@type": "WebSite", name: s.store_name, url: base },
    // Oferta nos dados estruturados só com venda aberta (nada de preço/disponibilidade não confirmados)
    ...(planList.length && ctx.salesOpen
      ? planList.map((product) => ({ "@context": "https://schema.org", "@type": "Product", name: product.name, description: product.shortDescription ?? undefined, sku: product.sku, brand: { "@type": "Brand", name: s.store_name }, ...(product.imageUrl ? { image: product.imageUrl } : {}), offers: { "@type": "Offer", url: `${base}/e-book#oferta`, priceCurrency: "BRL", price: (product.priceCents / 100).toFixed(2), availability: "https://schema.org/InStock" } }))
      : []),
    ...(ctx.faqs.length ? [{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: ctx.faqs.map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") } })) }] : []),
  ];

  return (
    <div data-motion={isOn(s.landing_animations ?? "true") ? "on" : "off"}>
      <QuizWelcome texts={resultTexts} />
      {sections.map((x) => {
        const C = RENDER[x.type];
        if (!C) return null;
        const anchor = anchorFor(x);
        const node = C({ section: heroOverride(x), ctx });
        return anchor ? (
          <div key={x.key} id={anchor} className="scroll-mt-20">
            {node}
          </div>
        ) : (
          <Fragment key={x.key}>{node}</Fragment>
        );
      })}
      <LandingTracker product={product ? { id: product.id, sku: product.sku, name: product.name, priceCents: product.priceCents } : null} />
      {isOn(s.sticky_cta_enabled) && product && <StickyMobileCTA label={s.sticky_cta_label || "Quero as receitas"} price={formatBRL(Math.min(...planList.map((x) => x.priceCents)))} />}
      {isOn(s.recent_purchases_enabled ?? "true") && <RecentPurchases />}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
    </div>
  );
}
