import { CartProvider } from "@/components/cart/CartProvider";
import { Analytics } from "@/components/providers/Analytics";
import { CookieBanner } from "@/components/providers/CookieBanner";
import { assignmentMap } from "@/lib/experiments";
import { currentAssignments } from "@/server/catalog";
import { getSettings, isOn, trackingIds } from "@/server/settings";

/** Providers do site, quiz e checkout (pedido, analytics, consentimento). O admin não usa. */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [settings, assignments] = await Promise.all([getSettings(), currentAssignments()]);
  const ids = trackingIds(settings);
  const bannerEnabled = isOn(settings.cookie_banner_enabled);
  return (
    <CartProvider>
      {children}
      <Analytics metaPixelIds={ids.metaPixelIds} gaId={ids.gaId} bannerEnabled={bannerEnabled} experiments={assignmentMap(assignments)} quizMetaEvents={isOn(settings.quiz_meta_events)} />
      {bannerEnabled && <CookieBanner />}
    </CartProvider>
  );
}
