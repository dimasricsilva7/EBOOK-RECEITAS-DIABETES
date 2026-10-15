import Link from "next/link";
import { Logo } from "@/components/layout/Logo";
import { Icon } from "@/components/ui/Icon";
import { getSettings } from "@/server/settings";

/** Layout enxuto do checkout e da página do pedido/acesso (sem menu, sem distrações). */
export default async function CheckoutLayout({ children }: { children: React.ReactNode }) {
  const s = await getSettings();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-bg">
        <div className="container-page flex h-16 items-center justify-between">
          <Link href="/" aria-label="Voltar ao início">
            <Logo name={s.store_name} logoUrl={s.logo_url || null} />
          </Link>
          <p className="flex items-center gap-1.5 text-xs font-semibold text-secondary sm:text-sm">
            <Icon name="lock" className="h-4 w-4" /> Ambiente seguro
          </p>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-line py-8 text-center text-xs text-muted">
        <nav className="flex flex-wrap justify-center gap-x-5 gap-y-1">
          <Link href="/suporte" className="hover:underline">Suporte</Link>
          <Link href="/politica-de-privacidade" className="hover:underline">Privacidade</Link>
          <Link href="/termos" className="hover:underline">Termos</Link>
          <Link href="/trocas-e-devolucoes" className="hover:underline">Reembolso</Link>
        </nav>
        <p className="mt-3">© {new Date().getFullYear()} {s.company_name || s.store_name}</p>
      </footer>
    </div>
  );
}
