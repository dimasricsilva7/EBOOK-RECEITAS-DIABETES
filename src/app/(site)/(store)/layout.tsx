import { Suspense } from "react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { LpFooter, LpHeader } from "@/components/layout/LpChrome";
import { getSettings } from "@/server/settings";

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const s = await getSettings();
  const header = <Header storeName={s.store_name} logoUrl={s.logo_url || null} ctaLabel={s.header_cta_label || "Comprar"} announcement={s.announcement_text || null} />;
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[80] focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2">
        Pular para o conteúdo
      </a>
      {/* ?lp=1 (página de anúncio): header só com logo, sem menu/links; e sem rodapé. */}
      <Suspense fallback={header}>
        <LpHeader storeName={s.store_name} logoUrl={s.logo_url || null}>{header}</LpHeader>
      </Suspense>
      <main id="conteudo" className="flex-1">
        {children}
      </main>
      <Suspense fallback={<Footer s={s} />}>
        <LpFooter><Footer s={s} /></LpFooter>
      </Suspense>
    </div>
  );
}
