"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "./Logo";

const NAV = [
  { href: "/e-book#conteudo-do-ebook", label: "O e-book" },
  { href: "/e-book#por-dentro", label: "Por dentro" },
  { href: "/e-book#oferta", label: "Investimento" },
  { href: "/e-book#faq", label: "Dúvidas" },
  { href: "/", label: "Fazer o quiz" },
  { href: "/acesso", label: "Meu acesso" },
];

export function Header({ storeName, logoUrl, ctaLabel, announcement }: { storeName: string; logoUrl: string | null; ctaLabel: string; announcement: string | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
  }, [open]);

  return (
    <>
      {announcement && <div className="bg-ink px-4 py-2 text-center text-xs font-medium text-bg">{announcement}</div>}
      <header className={`sticky top-0 z-50 transition-colors ${scrolled ? "border-b border-line bg-bg/90 backdrop-blur" : "bg-bg"}`}>
        <div className="container-page flex h-16 items-center gap-3 sm:h-[72px]">
          <Link href="/" className="mr-auto" aria-label={`${storeName} — início`}>
            <Logo name={storeName} logoUrl={logoUrl} />
          </Link>
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Principal">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="rounded-full px-3.5 py-2 text-sm font-medium text-ink/75 hover:text-ink">
                {n.label}
              </Link>
            ))}
          </nav>
          <Link href="/e-book#oferta" data-cta="header_cta" className="hidden min-h-[44px] items-center rounded-full bg-ink px-5 text-sm font-semibold text-bg hover:bg-ink/90 sm:inline-flex">
            {ctaLabel}
          </Link>
          <button onClick={() => setOpen(true)} className="-mr-2 grid h-11 w-11 place-items-center rounded-full lg:hidden" aria-label="Abrir menu" aria-expanded={open}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 8h16M4 16h16" /></svg>
          </button>
        </div>
      </header>

      {open && (
        <div className="fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} aria-label="Fechar menu" />
          <div className="absolute inset-y-0 right-0 flex w-[84%] max-w-xs animate-slidein flex-col bg-bg p-5 shadow-lift">
            <div className="flex items-center justify-between">
              <Logo name={storeName} logoUrl={logoUrl} />
              <button onClick={() => setOpen(false)} className="grid h-11 w-11 place-items-center rounded-full" aria-label="Fechar">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            <nav className="mt-8 flex flex-col" aria-label="Menu">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className="border-b border-line py-4 font-display text-xl">
                  {n.label}
                </Link>
              ))}
            </nav>
            <Link href="/e-book#oferta" onClick={() => setOpen(false)} data-cta="menu_cta" className="btn-primary mt-auto w-full">
              {ctaLabel}
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
