/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { Icon, formatIcon } from "@/components/ui/Icon";
import { RichText } from "@/components/ui/RichText";
import { VideoEmbed } from "@/components/ui/VideoEmbed";
import { Reveal } from "@/components/ui/Reveal";
import { MATERIAL_FORMAT_LABEL } from "@/lib/domain";
import { cfgArr, cfgStr, type SectionData } from "@/server/landing";
import { formatBRL } from "@/utils/format";
import type { PublicMaterial, PublicProduct } from "@/types/catalog";
import { BuyButton, FaqItem, OfferViewTracker, ScrollCta } from "./client";
import { BookGallery, CycleSteps, type CycleStep, type Slide } from "./interactive";

export type LandingCtx = {
  product: PublicProduct | null;
  /** Produtos à venda (hoje, oferta única: E-book R$ 67) */
  plans: (PublicProduct & { materialTitles: string[]; sellable: boolean })[];
  planCount: number;
  materials: (PublicMaterial & { plans: string[] })[];
  faqs: { id: string; question: string; answer: string }[];
  reviews: { id: string; name: string; title: string | null; text: string; rating: number; ageLabel: string | null; timeAgo: string | null; verified: boolean; photoUrl: string | null }[];
  reviewStats: { title: string; rating: string; count: string; countLabel: string; verifiedLabel: string; heroProof: string } | null;
  gallery: { id: string; title: string; imageUrl: string; alt: string }[];
  s: Record<string, string>;
  salesOpen: boolean;
  payment: { pix: boolean; crediario: string | null };
};

type P = { section: SectionData; ctx: LandingCtx };

const productRef = (p: PublicProduct | null) => (p ? { id: p.id, sku: p.sku, name: p.name, priceCents: p.priceCents } : null);
const closedText = (ctx: LandingCtx) => (ctx.salesOpen ? null : ctx.s.sales_closed_message || "As vendas ainda não estão abertas.");

/** Troca {preco} pelo preço real do produto (o texto do admin nunca fica com preço desatualizado). */
export const withPrice = (text: string, ctx: Pick<LandingCtx, "product">) => text.replace(/\{preco\}/g, ctx.product ? formatBRL(ctx.product.priceCents) : "—");

function Heading({ section, center = false, light = false }: { section: SectionData; center?: boolean; light?: boolean }) {
  const eyebrow = cfgStr(section.config, "eyebrow");
  return (
    <div className={center ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      {eyebrow && <p className={`eyebrow ${light ? "!text-accent" : ""}`}>{eyebrow}</p>}
      {section.title && <h2 className={`h-section text-balance ${eyebrow ? "mt-4" : ""} ${light ? "text-bg" : "text-ink"}`}>{section.title}</h2>}
      {section.subtitle && <p className={`lead mt-5 ${light ? "!text-bg/75" : ""}`}>{section.subtitle}</p>}
    </div>
  );
}

/**
 * CTA configurável: destino "checkout" leva direto ao checkout real (quando as vendas estão abertas e o
 * produto tem material pronto); com vendas fechadas, rola até a oferta, que mostra o estado verdadeiro.
 */
function Cta({ label, target, ctx, element, className = "btn-primary" }: { label: string; target: string | null | undefined; ctx: LandingCtx; element: string; className?: string }) {
  const plan = ctx.plans[0];
  if (target === "checkout") {
    if (ctx.salesOpen && plan?.sellable) return <BuyButton product={productRef(plan)} label={label} element={element} className={className} />;
    return <ScrollCta label={label} target="#oferta" element={element} className={className} />;
  }
  return <ScrollCta label={label} target={target || "#oferta"} element={element} className={className} />;
}

/** Composição decorativa (sem fingir ser foto ou produto) usada enquanto não há imagem real cadastrada. */
function SoftArt({ className = "" }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-[2rem] bg-sand ${className}`} aria-hidden="true">
      <div className="absolute -left-10 top-10 h-56 w-56 rounded-full bg-accent/50 blur-2xl" />
      <div className="absolute bottom-0 right-0 h-64 w-64 rounded-full bg-secondary/25 blur-3xl" />
      <Icon name="leaf" className="absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 text-secondary/70" strokeWidth={1.2} />
    </div>
  );
}

/** Ícone do selo pelo sentido do texto (o admin escreve livremente). */
function badgeIcon(text: string) {
  const t = text.toLowerCase();
  if (/pix|pagamento|segur|protegid/.test(t)) return "lock";
  if (/ritmo|tempo|quando quiser/.test(t)) return "clock";
  if (/acesso|download|e-mail/.test(t)) return "download";
  if (/educativ|conte[uú]do|e-book|leitura|digital/.test(t)) return "book";
  return "check";
}

/**
 * Capa do e-book em composição de livro. Com capa cadastrada, a imagem é exibida inteira, sem cortes ou
 * distorção; sem capa, mostra apenas uma capa tipográfica neutra com o nome do produto (não simula páginas).
 */
function BookMockup({ cover, title, subtitle, className = "", priority = false, float = false }: { cover: string | null | undefined; title: string; subtitle?: string | null; className?: string; priority?: boolean; float?: boolean }) {
  return (
    <div className={`relative mx-auto w-[min(72%,320px)] ${className}`}>
      <div className="absolute inset-x-8 -bottom-6 h-10 rounded-[50%] bg-ink/25 blur-2xl" aria-hidden="true" />
      <div className={`relative ${float ? "animate-float will-change-transform" : ""}`}>
        <div className="relative overflow-hidden rounded-l-[4px] rounded-r-xl shadow-lift ring-1 ring-ink/5">
          {cover ? (
            <img src={cover} alt={`Capa do ${title}`} width={600} height={800} className="block h-auto w-full" fetchPriority={priority ? "high" : undefined} loading={priority ? "eager" : "lazy"} />
          ) : (
            <div className="flex aspect-[3/4] flex-col justify-between bg-ink p-7 text-bg sm:p-9" role="img" aria-label={title}>
              <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-accent">E-book</span>
              <div>
                <p className="font-display text-[2.3rem] italic leading-[1.02] sm:text-5xl">{title}</p>
                {subtitle && <p className="mt-4 text-sm leading-snug text-bg/70">{subtitle}</p>}
              </div>
              <Icon name="leaf" className="h-7 w-7 text-accent" strokeWidth={1.3} />
            </div>
          )}
          <div className="pointer-events-none absolute inset-y-0 left-0 w-4 bg-gradient-to-r from-black/30 via-black/10 to-transparent" aria-hidden="true" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-white/0 to-white/15" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}

/** Título com destaque: use *trecho* no admin — o trecho sai colorido, em negrito e sublinhado. */
function RichTitle({ text }: { text: string }) {
  const parts = text.split(/\*([^*]+)\*/g);
  return (
    <>
      {parts.map((p, i) => (i % 2 ? <em key={i} className="font-bold not-italic text-primary underline decoration-accent decoration-[3px] underline-offset-[6px]">{p}</em> : p))}
    </>
  );
}

// ───────────── Hero ─────────────

export function Hero({ section, ctx }: P) {
  const badges = cfgArr<string>(section.config, "badges").filter(Boolean).slice(0, 4);
  const eyebrow = cfgStr(section.config, "eyebrow");
  const img = section.imageUrl;
  const [lead, ...rest] = (section.subtitle ?? "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  // Mobile-first: mockup no topo (menor), depois headline → subheadline → CTA, tudo centralizado.
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute -right-28 -top-36 h-[26rem] w-[26rem] rounded-full bg-accent/25 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -left-28 top-24 h-[22rem] w-[22rem] rounded-full bg-primary/10 blur-3xl" aria-hidden="true" />
      <div className="container-page relative flex flex-col items-center gap-5 pb-12 pt-5 text-center sm:gap-6 sm:pb-16 sm:pt-9">
        {/* Mockup do produto no topo — reajustado (menor) no mobile */}
        <div className="relative w-full animate-fade">
          {img ? (
            <img
              src={img}
              alt={cfgStr(section.config, "imageAlt") || ctx.product?.name || ""}
              width={900}
              height={760}
              className="mx-auto w-[66%] max-w-[260px] object-contain drop-shadow-2xl sm:w-full sm:max-w-[440px]"
              fetchPriority="high"
            />
          ) : (
            <BookMockup cover={ctx.product?.imageUrl} title={ctx.product?.name ?? "Diabetes à Mesa — E-book de Receitas"} subtitle={ctx.product?.subtitle} className="!w-[min(58%,220px)] sm:!w-[min(72%,300px)]" priority float />
          )}
        </div>

        {eyebrow && (
          <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-secondary">
            <Icon name="heart" className="h-3.5 w-3.5" /> {eyebrow}
          </p>
        )}
        {ctx.reviewStats?.heroProof && (
          <div className="flex items-center gap-2">
            <Stars n={5} className="gap-0.5" />
            <span className="text-sm font-bold text-ink/85">{ctx.reviewStats.heroProof}</span>
          </div>
        )}
        <h1 className="max-w-[20ch] text-balance font-display text-[2rem] leading-[1.08] text-ink sm:max-w-[22ch] sm:text-[2.9rem] lg:text-[3.2rem]">
          <RichTitle text={section.title ?? ""} />
        </h1>
        {lead && <p className="max-w-xl text-[1.0625rem] leading-relaxed text-ink/75 sm:text-lg">{lead}</p>}
        {rest.map((p, i) => (
          <p key={i} className="max-w-xl text-[15.5px] font-medium leading-relaxed text-ink/80">{p}</p>
        ))}
        <div className="mt-1 w-full max-w-md">
          <Cta label={section.ctaLabel || "Quero as receitas"} target={section.ctaTarget} ctx={ctx} element="hero_cta" className="btn-primary w-full text-base" />
          <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-muted"><Icon name="lock" className="h-3.5 w-3.5 text-secondary" /> Compra 100% segura · Acesso imediato</p>
        </div>
        {badges.length > 0 && (
          <ul className="mt-2 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-ink/70">
            {badges.map((b) => (
              <li key={b} className="flex items-center gap-1.5">
                <Icon name={badgeIcon(b)} className="h-4 w-4 text-secondary" />
                {b}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

// ───────────── Identificação (cards com foto real ou ilustração) ─────────────

type Card = { icon?: string; title?: string; text?: string; image?: string; alt?: string };

export function Identification({ section }: P) {
  const raw = cfgArr<Card | string>(section.config, "items");
  const cards: Card[] = raw.map((c) => (typeof c === "string" ? { title: c } : c)).filter((c) => c?.title).slice(0, 6);
  return (
    <section className="section paper">
      <div className="container-page">
        <Heading section={section} center />
        {cards.length > 0 && (
          <div className="mx-auto mt-10 grid max-w-4xl gap-3.5 sm:grid-cols-2 sm:gap-4">
            {cards.map((c, i) => (
              <Reveal key={i} delay={i * 70}>
                <article className="flex h-full items-start gap-4 rounded-card border border-line/80 bg-surface p-5 text-left shadow-soft transition duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lift">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                    <Icon name={c.icon || "heart"} className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="font-display text-[1.15rem] leading-snug text-ink">{c.title}</h3>
                    {c.text && <p className="mt-1 text-[14.5px] leading-relaxed text-muted">{c.text}</p>}
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        )}
        {section.body && (
          <p className="mx-auto mt-9 max-w-2xl text-center font-display text-xl italic leading-snug text-ink/85">{section.body}</p>
        )}
      </div>
    </section>
  );
}

// ───────────── Ciclo (interativo) ─────────────

export function Cycle({ section }: P) {
  const steps = cfgArr<CycleStep>(section.config, "steps").filter((s) => s?.title).slice(0, 6);
  if (!steps.length) return null;
  return (
    <section className="section">
      <div className="container-page">
        <Heading section={section} center />
        <CycleSteps steps={steps} />
        {section.body && (
          <p className="mx-auto mt-10 flex max-w-2xl items-start gap-3 rounded-2xl bg-sand/70 px-5 py-4 text-sm leading-relaxed text-ink/75">
            <Icon name="info" className="mt-0.5 h-5 w-5 shrink-0 text-secondary" />
            <span>{section.body}</span>
          </p>
        )}
      </div>
    </section>
  );
}

// ───────────── Compreensão dos padrões (versão estática, mantida para o admin) ─────────────

export function Patterns({ section }: P) {
  const steps = cfgArr<{ title?: string; text?: string }>(section.config, "steps").filter((s) => s?.title);
  return (
    <section className="section">
      <div className="container-page">
        <Heading section={section} center />
        {steps.length > 0 && (
          <ol className="mx-auto mt-14 grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <Reveal key={i} delay={i * 80}>
                <li className="relative h-full rounded-card border border-line bg-surface p-6">
                  <span className="font-display text-4xl italic text-accent">{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="mt-3 font-display text-xl text-ink">{s.title}</h3>
                  {s.text && <p className="mt-2 text-[15px] leading-relaxed text-muted">{s.text}</p>}
                </li>
              </Reveal>
            ))}
          </ol>
        )}
        {section.body && (
          <p className="mx-auto mt-10 flex max-w-2xl items-start gap-3 rounded-2xl bg-sand/70 px-5 py-4 text-sm leading-relaxed text-ink/75">
            <Icon name="info" className="mt-0.5 h-5 w-5 shrink-0 text-secondary" />
            <span>{section.body}</span>
          </p>
        )}
      </div>
    </section>
  );
}

// ───────────── Método / O que esperar (faixa escura com ícones) ─────────────

export function Method({ section }: P) {
  const items = cfgArr<{ icon?: string; title?: string; text?: string }>(section.config, "items").filter((x) => x?.title);
  return (
    <section className="section bg-ink text-bg">
      <div className="container-page">
        <Heading section={section} light />
        {items.length > 0 && (
          <div className="mt-12 grid gap-px overflow-hidden rounded-card bg-bg/10 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((it, i) => (
              <Reveal key={i} delay={i * 60} className="h-full">
                <div className="h-full bg-ink p-7 sm:p-8">
                  <span className="grid h-12 w-12 place-items-center rounded-full border border-bg/20 text-accent">
                    <Icon name={it.icon || "leaf"} className="h-6 w-6" />
                  </span>
                  <h3 className="mt-5 font-display text-[1.4rem] leading-snug text-bg">{it.title}</h3>
                  {it.text && <p className="mt-2 max-w-md leading-relaxed text-bg/70">{it.text}</p>}
                </div>
              </Reveal>
            ))}
          </div>
        )}
        {section.body && (
          <p className="mt-8 flex max-w-2xl items-start gap-3 text-sm text-bg/65">
            <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0 text-accent" /> {section.body}
          </p>
        )}
      </div>
    </section>
  );
}

// ───────────── O que é o Além da Fome (temas) ─────────────

export function Topics({ section }: P) {
  const items = cfgArr<{ icon?: string; title?: string; text?: string }>(section.config, "items").filter((x) => x?.title);
  if (!items.length) return null;
  return (
    <section className="section">
      <div className="container-page grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <Heading section={section} />
          {section.body && <RichText text={section.body} className="mt-6 text-[15.5px] leading-relaxed text-ink/75" />}
        </div>
        <ol className="grid gap-3">
          {items.map((it, i) => (
            <Reveal key={i} delay={i * 60}>
              <li className="flex gap-5 rounded-card border border-line bg-surface p-5 transition duration-300 hover:border-primary/30 hover:shadow-soft sm:p-6">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-sand text-primary">
                  <Icon name={it.icon || "leaf"} className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-display text-xl leading-snug text-ink">{it.title}</h3>
                  {it.text && <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{it.text}</p>}
                </div>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

// ───────────── Por dentro do e-book (galeria real) ─────────────

export function Showcase({ section, ctx }: P) {
  const formatItems = cfgArr<string>(section.config, "formatItems").filter(Boolean);
  const excerpts = cfgArr<string>(section.config, "excerpts").filter(Boolean).slice(0, 3);
  const name = ctx.product?.name ?? "Diabetes à Mesa — E-book de Receitas";
  // Só imagens reais: capa cadastrada + páginas enviadas na Galeria do admin
  const slides: Slide[] = [
    ...(ctx.product?.imageUrl ? [{ id: "capa", src: ctx.product.imageUrl, alt: `Capa do ${name}`, caption: "Capa", contain: true }] : []),
    ...ctx.gallery.map((g) => ({ id: g.id, src: g.imageUrl, alt: g.alt || g.title || "Página interna do e-book", caption: g.title || null })),
  ];
  const hasPages = ctx.gallery.length > 0;
  return (
    <section className="section paper">
      <div className="container-page">
        <div className="grid items-center gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:gap-20">
          <div className="relative rounded-[2rem] bg-surface/70 px-6 py-12 sm:py-14">
            {section.imageUrl ? (
              <img src={section.imageUrl} alt={cfgStr(section.config, "imageAlt") || `Apresentação do ${name}`} width={800} height={800} loading="lazy" className="mx-auto block h-auto max-h-[520px] w-auto max-w-full rounded-2xl" />
            ) : (
              <BookMockup cover={ctx.product?.imageUrl} title={name} subtitle={ctx.product?.subtitle} />
            )}
          </div>
          <div>
            <Heading section={section} />
            {section.body && <RichText text={section.body} className="mt-6 text-[1.0625rem] leading-relaxed text-ink/80" />}
            {formatItems.length > 0 && (
              <ul className="mt-8 grid gap-3 sm:grid-cols-2">
                {formatItems.map((t) => (
                  <li key={t} className="flex gap-3 rounded-2xl bg-surface/80 px-4 py-3 text-[15px] leading-snug text-ink/85">
                    <Icon name="check" className="mt-0.5 h-5 w-5 shrink-0 text-secondary" strokeWidth={2} /> {t}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-9">
              <Cta label={section.ctaLabel || "Quero o e-book"} target={section.ctaTarget} ctx={ctx} element="showcase_cta" className="btn-primary w-full sm:w-auto" />
            </div>
          </div>
        </div>

        {hasPages && (
          <div className="mt-16">
            <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-secondary">{cfgStr(section.config, "previewTitle") || "Folheie algumas páginas"}</p>
            <div className="mx-auto mt-6 max-w-5xl">
              <BookGallery slides={slides} />
            </div>
          </div>
        )}

        {excerpts.length > 0 && (
          <div className="mx-auto mt-14 grid max-w-5xl gap-4 md:grid-cols-3">
            {excerpts.map((t, i) => (
              <Reveal key={i} delay={i * 80}>
                <blockquote className="h-full rounded-card border border-line bg-surface p-6 font-display text-lg italic leading-snug text-ink/85">
                  <span className="mb-2 block font-display text-4xl not-italic leading-none text-accent" aria-hidden="true">“</span>
                  {t}
                </blockquote>
              </Reveal>
            ))}
            <p className="text-center text-xs text-muted md:col-span-3">Trechos do e-book Diabetes à Mesa.</p>
          </div>
        )}
      </div>
    </section>
  );
}

// ───────────── Sobre a autora (só publica com autoria confirmada no admin) ─────────────

export function Author({ section }: P) {
  const name = cfgStr(section.config, "name");
  const role = cfgStr(section.config, "role");
  const context = cfgStr(section.config, "context");
  // Autoria e imagem precisam ser confirmadas por quem tem os documentos (Admin → Landing → Sobre a autora)
  if (cfgStr(section.config, "confirmed") !== "true") return null;
  if (!name && !section.body) return null;
  return (
    <section className="section">
      <div className="container-page">
        <div className="mx-auto grid max-w-5xl items-center gap-10 overflow-hidden rounded-[2rem] border border-line bg-surface p-6 sm:p-10 md:grid-cols-[0.8fr_1.2fr] lg:gap-14 lg:p-14">
          <div className="relative mx-auto w-full max-w-[250px] sm:max-w-[320px]">
            <div className="absolute -right-3 -top-3 h-full w-full rounded-[1.75rem] border border-accent/60" aria-hidden="true" />
            {section.imageUrl ? (
              <img src={section.imageUrl} alt={cfgStr(section.config, "imageAlt") || `Fotografia de ${name}`} width={640} height={800} loading="lazy" className="relative aspect-[4/5] w-full rounded-[1.75rem] object-cover" />
            ) : (
              <div className="relative grid aspect-[4/5] w-full place-items-center rounded-[1.75rem] bg-sand" role="img" aria-label={`Espaço para a fotografia de ${name}`}>
                <span className="font-display text-7xl italic text-primary/70">{name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("")}</span>
              </div>
            )}
          </div>
          <div>
            <p className="eyebrow">{cfgStr(section.config, "eyebrow") || "Sobre a autora"}</p>
            {name && <h2 className="mt-4 font-display text-[2.3rem] leading-[1.08] text-ink sm:text-5xl">{name}</h2>}
            {role && <p className="mt-2 text-sm font-semibold uppercase tracking-[0.14em] text-secondary">{role}</p>}
            {section.body && <RichText text={section.body} className="mt-6 text-[1.0625rem] leading-relaxed text-ink/85" />}
            {context && <p className="mt-6 border-l-2 border-accent pl-5 font-display text-xl italic leading-snug text-ink/90">{context}</p>}
          </div>
        </div>
      </div>
    </section>
  );
}

// ───────────── Conteúdo incluído (somente materiais REAIS e prontos) ─────────────

export function Content({ section, ctx }: P) {
  if (!ctx.materials.length) return null;
  return (
    <section id="conteudo-incluido" className="section">
      <div className="container-page">
        <Heading section={section} />
        <div className="mt-12 grid gap-5 md:grid-cols-2">
          {ctx.materials.map((m, i) => (
            <Reveal key={m.id} delay={i * 60}>
              <article className="flex h-full flex-col overflow-hidden rounded-card border border-line bg-surface">
                {m.coverUrl && <img src={m.coverUrl} alt={`Capa: ${m.title}`} className="aspect-[16/9] w-full object-cover" loading="lazy" />}
                <div className="flex flex-1 flex-col p-6 sm:p-7">
                  <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-secondary">
                    <Icon name={formatIcon(m.format)} className="h-4 w-4" /> {MATERIAL_FORMAT_LABEL[m.format]}
                  </p>
                  <h3 className="mt-3 font-display text-2xl leading-snug text-ink">{m.title}</h3>
                  {m.description && <p className="mt-3 leading-relaxed text-ink/80">{m.description}</p>}
                  {m.howToUse && (
                    <p className="mt-5 border-t border-line pt-5 text-[15px] text-muted">
                      <span className="font-semibold text-ink">Como usar: </span>
                      {m.howToUse}
                    </p>
                  )}
                </div>
              </article>
            </Reveal>
          ))}
        </div>
        {section.body && <p className="mt-6 text-sm text-muted">{section.body}</p>}
      </div>
    </section>
  );
}

// ───────────── Como você acessa ─────────────

export function Experience({ section }: P) {
  const steps = cfgArr<{ title?: string; text?: string }>(section.config, "steps").filter((s) => s?.title);
  const note = cfgStr(section.config, "imageNote");
  return (
    <section className="section paper">
      <div className="container-page grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
        <div>
          <Heading section={section} />
          {steps.length > 0 && (
            <ol className="mt-10 space-y-6">
              {steps.map((s, i) => (
                <li key={i} className="flex gap-5">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary font-display text-lg text-white">{i + 1}</span>
                  <div>
                    <h3 className="font-display text-xl text-ink">{s.title}</h3>
                    {s.text && <p className="mt-1 leading-relaxed text-muted">{s.text}</p>}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
        {section.imageUrl ? (
          <figure>
            <img src={section.imageUrl} alt={cfgStr(section.config, "imageAlt") || ""} className="w-full rounded-card object-cover shadow-lift" loading="lazy" />
            {note && <figcaption className="mt-3 text-center text-xs text-muted">{note}</figcaption>}
          </figure>
        ) : (
          <SoftArt className="aspect-[4/3] w-full" />
        )}
      </div>
    </section>
  );
}

// ───────────── Vídeo e galeria ─────────────

export function Video({ section }: P) {
  if (!section.videoUrl) return null;
  return (
    <section className="section">
      <div className="container-page">
        <Heading section={section} center />
        <VideoEmbed url={section.videoUrl} title={section.title || "Vídeo"} className="mx-auto mt-10 max-w-3xl rounded-card" vertical={cfgStr(section.config, "vertical") === "true"} />
      </div>
    </section>
  );
}

export function GallerySection({ section, ctx }: P) {
  if (!ctx.gallery.length) return null;
  return (
    <section className="section">
      <div className="container-page">
        <Heading section={section} center />
        <div className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-3">
          {ctx.gallery.slice(0, 9).map((g) => (
            <figure key={g.id} className="overflow-hidden rounded-2xl">
              <img src={g.imageUrl} alt={g.alt || g.title} className="aspect-square w-full object-cover" loading="lazy" />
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

// ───────────── Para quem é ─────────────

export function Audience({ section }: P) {
  const yes = cfgArr<string>(section.config, "forYou").filter(Boolean);
  const no = cfgArr<string>(section.config, "notForYou").filter(Boolean);
  return (
    <section className="section">
      <div className="container-page">
        <Heading section={section} center />
        <div className="mx-auto mt-12 grid max-w-5xl gap-5 md:grid-cols-2">
          {yes.length > 0 && (
            <div className="rounded-card border border-line bg-surface p-7">
              <h3 className="font-display text-2xl text-ink">{cfgStr(section.config, "forYouTitle") || "É para você se…"}</h3>
              <ul className="mt-5 space-y-3">
                {yes.map((t) => (
                  <li key={t} className="flex gap-3 leading-relaxed text-ink/85">
                    <Icon name="check" className="mt-1 h-4 w-4 shrink-0 text-secondary" strokeWidth={2} /> {t}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {no.length > 0 && (
            <div className="rounded-card border border-line bg-sand/60 p-7">
              <h3 className="font-display text-2xl text-ink">{cfgStr(section.config, "notForYouTitle") || "Não é o caminho se…"}</h3>
              <ul className="mt-5 space-y-3">
                {no.map((t) => (
                  <li key={t} className="flex gap-3 leading-relaxed text-ink/80">
                    <Icon name="info" className="mt-1 h-4 w-4 shrink-0 text-primary" /> {t}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ───────────── Confiança (autoria só se preenchida) ─────────────

export function Trust({ section, ctx }: P) {
  const items = cfgArr<{ icon?: string; title?: string; text?: string }>(section.config, "items").filter((x) => x?.title);
  const s = ctx.s;
  const hasAuthor = Boolean(s.author_name && s.author_bio);
  if (!hasAuthor && !items.length) return null;
  return (
    <section className="section paper">
      <div className="container-page">
        <Heading section={section} center />
        {items.length > 0 && (
          <ul className="mx-auto mt-10 grid max-w-5xl gap-4 sm:grid-cols-3">
            {items.map((it, i) => (
              <li key={i} className="rounded-2xl bg-surface/80 p-6 text-center">
                <Icon name={it.icon || "shield"} className="mx-auto h-7 w-7 text-secondary" />
                <h3 className="mt-3 font-display text-lg text-ink">{it.title}</h3>
                {it.text && <p className="mt-1 text-sm leading-relaxed text-muted">{it.text}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

// ───────────── Transparência (resumo do que se compra) ─────────────

export function Facts({ section, ctx }: P) {
  const items = cfgArr<{ icon?: string; title?: string; text?: string }>(section.config, "items").filter((x) => x?.title);
  if (!items.length) return null;
  return (
    <section className="section">
      <div className="container-page">
        <Heading section={section} center />
        <dl className="mx-auto mt-12 grid max-w-5xl gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it, i) => (
            <div key={i} className="flex gap-4 bg-surface p-6">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sand text-primary">
                <Icon name={it.icon || "check"} className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <dt className="font-display text-lg text-ink">{it.title}</dt>
                {it.text && (
                  <dd className="mt-1 text-[15px] leading-relaxed text-muted">
                    <RichText text={withPrice(it.text, ctx)} />
                  </dd>
                )}
              </div>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

// ───────────── Depoimentos (somente reais e aprovados) ─────────────

export function Stars({ n = 5, className = "" }: { n?: number; className?: string }) {
  return (
    <span className={`inline-flex ${className}`} aria-label={`${n} de 5 estrelas`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} viewBox="0 0 20 20" className={`h-4 w-4 ${i < n ? "text-accent" : "text-line"}`} fill="currentColor" aria-hidden="true">
          <path d="M10 1.6l2.47 5.01 5.53.8-4 3.9.94 5.5L10 14.2l-4.95 2.6.94-5.5-4-3.9 5.53-.8z" />
        </svg>
      ))}
    </span>
  );
}

const AVATAR_COLORS = ["bg-primary", "bg-secondary", "bg-[#7C5CFF]", "bg-[#E8734A]", "bg-[#2E9E6B]", "bg-[#C2448A]"];
const avatarColor = (name: string) => AVATAR_COLORS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length];

/** Avaliações no estilo "prova social" (nota média, estrelas, total e cards). Tudo editável no admin. */
export function Reviews({ section, ctx }: P) {
  const stats = ctx.reviewStats;
  if (!ctx.reviews.length || !stats) return null;
  const items = ctx.reviews.slice(0, 12);
  return (
    <section className="section paper">
      <div className="container-page">
        <div className="mx-auto max-w-2xl text-center">
          {cfgStr(section.config, "eyebrow") && <p className="eyebrow">{cfgStr(section.config, "eyebrow")}</p>}
          <h2 className="h-section mt-3 text-ink">{stats.title}</h2>
          {(stats.rating || stats.count) && (
            <div className="mt-5 flex flex-col items-center gap-1.5">
              <div className="flex items-center gap-3">
                {stats.rating && <span className="font-display text-5xl tabular-nums text-ink">{stats.rating}</span>}
                <Stars n={5} className="gap-0.5 [&_svg]:h-6 [&_svg]:w-6" />
              </div>
              {stats.count && <p className="text-sm text-muted">Baseado em {stats.count} {stats.countLabel}</p>}
            </div>
          )}
        </div>
        <div className="mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:grid-cols-2 sm:gap-5 sm:overflow-visible lg:grid-cols-3">
          {items.map((r) => (
            <figure key={r.id} className="flex w-[82%] shrink-0 snap-start flex-col rounded-card border border-line bg-surface p-6 shadow-soft sm:w-auto">
              <div className="flex items-center gap-3">
                {r.photoUrl ? (
                  <img src={r.photoUrl} alt="" className="h-11 w-11 rounded-full object-cover" loading="lazy" />
                ) : (
                  <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${avatarColor(r.name)} font-display text-lg text-white`}>{r.name.trim().charAt(0).toUpperCase()}</span>
                )}
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">{r.name}{r.ageLabel ? `, ${r.ageLabel}` : ""}</p>
                  {r.timeAgo && <p className="text-xs text-muted">{r.timeAgo}</p>}
                </div>
              </div>
              <Stars n={r.rating || 5} className="mt-3 gap-0.5" />
              {r.title && <p className="mt-3 font-bold leading-snug text-ink">{r.title}</p>}
              <p className="mt-2 flex-1 text-[15px] leading-relaxed text-muted">{r.text}</p>
              {r.verified && (
                <p className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-secondary">
                  <Icon name="check" className="h-4 w-4" /> {stats.verifiedLabel}
                </p>
              )}
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

// ───────────── Oferta (produto único) ─────────────

export function Offer({ section, ctx }: P) {
  const plans = ctx.plans;
  if (!plans.length) return null;
  const extra = cfgArr<string>(section.config, "includes").filter(Boolean);
  const steps = cfgArr<{ title?: string; text?: string }>(section.config, "steps").filter((x) => x?.title);
  const s = ctx.s;
  return (
    <OfferViewTracker id="oferta" productId={plans[0].id} valueCents={plans[0].priceCents} className="section paper">
      <div className="container-page">
        <Heading section={section} center />
        {plans.map((p) => {
          const items = [...new Set([...p.materialTitles, ...extra])];
          return (
            <article key={p.id} className="mx-auto mt-12 grid max-w-5xl overflow-hidden rounded-[2rem] border border-line bg-surface shadow-lift md:grid-cols-[0.85fr_1.15fr]">
              <div className="relative flex items-center justify-center bg-sand px-6 py-12">
                <div className="absolute -left-10 top-6 h-40 w-40 rounded-full bg-accent/40 blur-2xl" aria-hidden="true" />
                <BookMockup cover={p.imageUrl} title={p.name} subtitle={p.subtitle} className="!w-[min(62%,240px)]" />
              </div>
              <div className="flex flex-col p-7 sm:p-10">
                <p className="eyebrow">{p.badge || "Produto digital educativo"}</p>
                <h3 className="mt-3 font-display text-3xl text-ink sm:text-[2.2rem]">{p.name}</h3>
                {p.shortDescription && <p className="mt-3 leading-relaxed text-muted">{p.shortDescription}</p>}
                {items.length > 0 && (
                  <ul className="mt-6 space-y-2.5 border-t border-line pt-6">
                    {items.map((t) => (
                      <li key={t} className="flex gap-3 text-[15.5px] text-ink/90">
                        <Icon name="check" className="mt-0.5 h-5 w-5 shrink-0 text-secondary" strokeWidth={2} /> {t}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-7 flex flex-wrap items-end gap-x-3 gap-y-1">
                  {p.listPriceCents && <s className="text-lg text-muted">{formatBRL(p.listPriceCents)}</s>}
                  <span className="font-display text-5xl tabular-nums text-ink">{formatBRL(p.priceCents)}</span>
                  {p.promoLabel && <span className="chip bg-accent/25 text-ink">{p.promoLabel}</span>}
                </div>
                <p className="mt-2 text-sm text-muted">
                  Pagamento único{ctx.payment.pix ? " via PIX" : ""}
                  {ctx.payment.crediario ? ` · ou ${ctx.payment.crediario}` : ""}. Sem mensalidade.
                </p>
                <div className="mt-6">
                  <BuyButton product={productRef(p)} label={section.ctaLabel || "Quero acessar o e-book"} element={`offer_cta_${p.slug}`} className="btn-primary w-full" disabledText={closedText(ctx) ?? (p.sellable ? null : "Este produto abre em breve.")} />
                </div>
                <p className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted">
                  <a href="#faq" className="underline-offset-2 hover:underline">Dúvidas</a>
                  <Link href="/suporte" className="underline-offset-2 hover:underline">Suporte</Link>
                  <Link href="/termos" className="underline-offset-2 hover:underline">Termos de compra</Link>
                  <Link href="/trocas-e-devolucoes" className="underline-offset-2 hover:underline">Reembolso</Link>
                </p>
              </div>
            </article>
          );
        })}

        {steps.length > 0 && (
          <ol className="mx-auto mt-10 grid max-w-5xl gap-4 sm:grid-cols-3">
            {steps.map((st, i) => (
              <li key={i} className="flex gap-4 rounded-2xl bg-surface/80 p-5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary font-display text-white">{i + 1}</span>
                <div>
                  <h4 className="font-display text-lg text-ink">{st.title}</h4>
                  {st.text && <p className="mt-1 text-sm leading-relaxed text-muted">{st.text}</p>}
                </div>
              </li>
            ))}
          </ol>
        )}

        {s.guarantee_enabled === "true" && s.guarantee_text && (
          <div className="mx-auto mt-8 max-w-3xl rounded-2xl bg-surface/80 p-6 text-center">
            <p className="flex items-center justify-center gap-2 font-display text-xl text-ink">
              <Icon name="shield" className="h-5 w-5 text-secondary" /> {s.guarantee_title || "Garantia"}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted">{s.guarantee_text}</p>
          </div>
        )}
        {section.body && <p className="mx-auto mt-6 max-w-xl text-center text-xs leading-relaxed text-muted">{section.body}</p>}
      </div>
    </OfferViewTracker>
  );
}

// ───────────── Limites do produto ─────────────

export function Limits({ section }: P) {
  return (
    <section className="py-14">
      <div className="container-page">
        <div className="mx-auto flex max-w-3xl gap-4 rounded-card border border-line bg-surface p-6 sm:p-8">
          <Icon name="info" className="mt-1 h-6 w-6 shrink-0 text-primary" />
          <div>
            {section.title && <h2 className="font-display text-2xl text-ink">{section.title}</h2>}
            <RichText text={section.body} className="mt-3 leading-relaxed text-ink/80" />
          </div>
        </div>
      </div>
    </section>
  );
}

// ───────────── FAQ e CTA final ─────────────

export function Faq({ section, ctx }: P) {
  if (!ctx.faqs.length) return null;
  return (
    <section id="faq" className="section">
      <div className="container-page grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
        <div>
          <Heading section={section} />
          <p className="mt-6 text-[15px] text-muted">
            Não encontrou sua dúvida?{" "}
            <Link href="/suporte" className="font-semibold text-primary underline underline-offset-2">
              Fale com o suporte
            </Link>
            .
          </p>
        </div>
        <div className="border-t border-line">
          {ctx.faqs.map((f, i) => (
            <FaqItem key={f.id} i={i} q={f.question} a={<RichText text={withPrice(f.answer, ctx)} />} />
          ))}
        </div>
      </div>
    </section>
  );
}

export function FinalCta({ section, ctx }: P) {
  return (
    <section className="relative overflow-hidden bg-ink text-bg">
      <div className="pointer-events-none absolute -left-24 top-0 h-80 w-80 rounded-full bg-primary/30 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -right-24 bottom-0 h-80 w-80 rounded-full bg-secondary/25 blur-3xl" aria-hidden="true" />
      <div className="container-page section relative grid items-center gap-12 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="text-center lg:text-left">
          {section.title && (
            <h2 className="mx-auto max-w-3xl text-balance font-display text-[2.1rem] leading-[1.1] sm:text-5xl lg:mx-0">
              <RichTitle text={section.title} />
            </h2>
          )}
          {section.subtitle && <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-bg/75 lg:mx-0">{section.subtitle}</p>}
          <div className="mx-auto mt-9 max-w-sm lg:mx-0">
            <Cta label={section.ctaLabel || "Quero conhecer o e-book"} target={section.ctaTarget} ctx={ctx} element="final_cta" className="btn btn-primary w-full" />
          </div>
        </div>
        <div className="hidden lg:block">
          <BookMockup cover={ctx.product?.imageUrl} title={ctx.product?.name ?? "Diabetes à Mesa — E-book de Receitas"} subtitle={ctx.product?.subtitle} className="!w-[min(70%,260px)]" />
        </div>
      </div>
      {ctx.s.footer_text && <p className="container-page relative pb-10 text-center text-xs text-bg/50">{ctx.s.footer_text}</p>}
    </section>
  );
}
