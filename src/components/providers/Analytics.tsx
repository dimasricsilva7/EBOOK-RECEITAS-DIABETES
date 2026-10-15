"use client";

import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { adsAllowed, captureAttribution, configureConsent, configureMetaCustom, getIds, metaEvent, setExperiments, track } from "@/lib/client/tracking";

type Props = { metaPixelIds: string[]; gaId: string | null; bannerEnabled: boolean; experiments: Record<string, string>; quizMetaEvents: boolean };

function PageTracker() {
  const pathname = usePathname();
  const search = useSearchParams();
  const last = useRef("");

  useEffect(() => {
    const key = `${pathname}?${search?.toString() ?? ""}`;
    if (last.current === key) return;
    last.current = key;
    captureAttribution();
    getIds();
    metaEvent("PageView", {}, { mirror: true, internal: { name: "page_view" } });
    if (adsAllowed() && window.gtag) window.gtag("event", "page_view", { page_path: pathname, page_location: location.href });
  }, [pathname, search]);

  // Cliques em elementos com data-cta (hero, kits, galeria, bump, checkout…)
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-cta]");
      if (!el) return;
      track("cta_click", { element: el.dataset.cta ?? null, productId: el.dataset.product ?? null, props: { label: el.textContent?.trim().slice(0, 60) ?? null } });
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);
  return null;
}

/**
 * Meta Pixel e GA4 só carregam com IDs válidos (Admin → Configurações) e, se o
 * banner de cookies estiver ativo, somente após o consentimento do visitante.
 * O analytics próprio (primeira parte, sem compartilhamento) roda sempre.
 */
export function Analytics({ metaPixelIds, gaId, bannerEnabled, experiments, quizMetaEvents }: Props) {
  // Configurado no render (idempotente) para valer já no primeiro PageView do filho
  if (typeof window !== "undefined") {
    configureConsent(bannerEnabled);
    setExperiments(experiments);
    configureMetaCustom(quizMetaEvents);
  }
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    setAllowed(adsAllowed());
    const on = () => setAllowed(adsAllowed());
    window.addEventListener("hb:consent", on);
    return () => window.removeEventListener("hb:consent", on);
  }, [bannerEnabled, experiments]);

  const loadMeta = allowed && metaPixelIds.length > 0;
  const loadGa = allowed && Boolean(gaId);
  return (
    <>
      {loadMeta && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');${metaPixelIds.map((id) => `fbq('init','${id}');`).join("")}`}
        </Script>
      )}
      {loadGa && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`} strategy="afterInteractive" />
          <Script id="ga4" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());gtag('config','${gaId}',{send_page_view:false});`}
          </Script>
        </>
      )}
      <Suspense fallback={null}>
        <PageTracker />
      </Suspense>
    </>
  );
}
