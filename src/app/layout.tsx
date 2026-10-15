import type { Metadata, Viewport } from "next";
import { DM_Sans, Fraunces } from "next/font/google";
import { siteUrl } from "@/lib/env";
import { themeCss } from "@/lib/theme";
import { getSettings } from "@/server/settings";
import "./globals.css";

const display = Fraunces({ subsets: ["latin"], variable: "--font-display", weight: ["400", "500", "600"], style: ["normal", "italic"], display: "swap" });
const body = DM_Sans({ subsets: ["latin"], variable: "--font-body", weight: ["400", "500", "600", "700"], display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings();
  const title = s.seo_title || s.store_name;
  const description = s.seo_description;
  const images = [s.og_image_url || "/og"];
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: title, template: `%s | ${s.store_name}` },
    description,
    applicationName: s.store_name,
    openGraph: { type: "website", locale: "pt_BR", siteName: s.store_name, title, description, images },
    twitter: { card: "summary_large_image", title, description, images },
    icons: { icon: s.favicon_url || "/favicon.svg" },
    formatDetection: { telephone: false },
    verification: s.meta_domain_verification ? { other: { "facebook-domain-verification": s.meta_domain_verification } } : undefined,
  };
}

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#FAF6F1", viewportFit: "cover" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSettings();
  const css = themeCss(settings);
  return (
    <html lang="pt-BR" className={`${display.variable} ${body.variable}`}>
      <head>{css && <style id="theme-tokens">{css}</style>}</head>
      <body>{children}</body>
    </html>
  );
}
