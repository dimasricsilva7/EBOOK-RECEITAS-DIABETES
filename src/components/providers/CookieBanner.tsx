"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getConsent, setConsent, track } from "@/lib/client/tracking";

/**
 * Aviso de cookies (LGPD, modelo de recusa): medição e marketing ficam ativos por
 * padrão e o visitante pode recusar aqui ou depois pelo link "Preferências de cookies".
 */
export function CookieBanner() {
  const [show, setShow] = useState(false);
  const pathname = usePathname();
  useEffect(() => {
    setShow(getConsent() === null);
    const open = () => setShow(true);
    window.addEventListener("hb:open-consent", open);
    return () => window.removeEventListener("hb:open-consent", open);
  }, []);
  // No checkout e na página do PIX o aviso não cobre o botão de pagamento
  if (!show || pathname.startsWith("/checkout") || pathname.startsWith("/pedido")) return null;
  const choose = (v: "granted" | "denied") => {
    setConsent(v);
    track("cookie_consent", { props: { choice: v } });
    setShow(false);
  };
  return (
    <div className="fixed inset-x-3 bottom-[5.5rem] z-[70] mx-auto max-w-xl rounded-2xl border border-line bg-surface p-3 shadow-lift sm:bottom-5 sm:p-4" role="dialog" aria-label="Aviso de cookies">
      <p className="text-[13px] leading-snug text-ink sm:text-sm">
        Usamos cookies para a loja funcionar e para medir nossos anúncios.{" "}
        <Link href="/cookies" className="font-semibold text-primary underline">
          Saiba mais
        </Link>
      </p>
      <div className="mt-2 flex gap-2">
        <button onClick={() => choose("granted")} className="min-h-[40px] flex-1 rounded-xl bg-ink px-4 text-sm font-bold text-white">
          Ok
        </button>
        <button onClick={() => choose("denied")} className="min-h-[40px] flex-1 rounded-xl border-2 border-line px-4 text-sm font-bold">
          Recusar
        </button>
      </div>
    </div>
  );
}

/** Link do rodapé para rever a escolha. */
export function CookiePreferencesLink({ className = "" }: { className?: string }) {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event("hb:open-consent"))} className={className}>
      Preferências de cookies
    </button>
  );
}
