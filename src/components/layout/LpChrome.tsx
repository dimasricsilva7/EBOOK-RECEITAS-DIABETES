"use client";

import { useSearchParams } from "next/navigation";
import { Logo } from "./Logo";

/** Modo landing de anúncio (?lp=1): header só com o logo (sem menu/links) e sem rodapé. */
export function LpHeader({ children, storeName, logoUrl }: { children: React.ReactNode; storeName: string; logoUrl: string | null }) {
  const lp = useSearchParams().get("lp") === "1";
  if (!lp) return <>{children}</>;
  return (
    <header className="border-b border-line/60 bg-surface">
      <div className="container-page flex h-16 items-center justify-center">
        <Logo name={storeName} logoUrl={logoUrl} />
      </div>
    </header>
  );
}

export function LpFooter({ children }: { children: React.ReactNode }) {
  const lp = useSearchParams().get("lp") === "1";
  return lp ? null : <>{children}</>;
}
