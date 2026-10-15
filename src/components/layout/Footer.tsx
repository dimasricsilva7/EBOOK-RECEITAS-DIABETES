import Link from "next/link";
import { CookiePreferencesLink } from "@/components/providers/CookieBanner";
import type { Settings } from "@/server/settings";
import { Logo } from "./Logo";

export function whatsappLink(number: string, text?: string) {
  const digits = number.replace(/\D/g, "");
  if (digits.length < 10) return null;
  const full = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${full}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

/** Rodapé: só exibe contatos e dados do responsável realmente preenchidos em Configurações. */
export function Footer({ s }: { s: Settings }) {
  const wa = s.whatsapp ? whatsappLink(s.whatsapp) : null;
  const socials = [
    ["Instagram", s.instagram_url],
    ["TikTok", s.tiktok_url],
    ["Facebook", s.facebook_url],
    ["YouTube", s.youtube_url],
  ].filter(([, url]) => url && /^https:\/\//.test(url));
  const company = [s.company_name, s.company_document ? (s.company_document.replace(/\D/g, "").length > 11 ? `CNPJ ${s.company_document}` : `CPF/CNPJ ${s.company_document}`) : "", s.address].filter(Boolean);

  return (
    <footer className="mt-auto bg-ink pb-28 pt-16 text-bg/75 lg:pb-14">
      <div className="container-page grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo name={s.store_name} logoUrl={s.logo_url || null} light />
          {s.store_tagline && <p className="mt-4 max-w-xs text-sm leading-relaxed text-bg/65">{s.store_tagline}</p>}
        </div>
        <nav aria-label="Produto">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Produto</p>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li><Link href="/e-book#conteudo-do-ebook" className="hover:text-bg">O e-book</Link></li>
            <li><Link href="/" className="hover:text-bg">Fazer o quiz</Link></li>
            <li><Link href="/e-book#faq" className="hover:text-bg">Perguntas frequentes</Link></li>
            <li><Link href="/acesso" className="hover:text-bg">Meu acesso</Link></li>
          </ul>
        </nav>
        <nav aria-label="Políticas">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Políticas</p>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li><Link href="/termos" className="hover:text-bg">Termos de uso</Link></li>
            <li><Link href="/politica-de-privacidade" className="hover:text-bg">Privacidade</Link></li>
            <li><Link href="/trocas-e-devolucoes" className="hover:text-bg">Reembolso</Link></li>
            <li><Link href="/cookies" className="hover:text-bg">Cookies</Link></li>
            <li><CookiePreferencesLink className="text-left hover:text-bg" /></li>
          </ul>
        </nav>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Suporte</p>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li><Link href="/suporte" className="hover:text-bg">Fale com a gente</Link></li>
            {wa && <li><a href={wa} target="_blank" rel="noopener noreferrer" className="hover:text-bg">WhatsApp</a></li>}
            {s.contact_email && <li><a href={`mailto:${s.contact_email}`} className="break-all hover:text-bg">{s.contact_email}</a></li>}
            {s.support_hours && <li className="text-bg/55">{s.support_hours}</li>}
          </ul>
          {socials.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2 text-sm">
              {socials.map(([label, url]) => (
                <li key={label}>
                  <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[40px] items-center rounded-full border border-bg/15 px-3 hover:border-bg/40">{label}</a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="container-page mt-12 border-t border-bg/10 pt-6 text-xs leading-relaxed text-bg/50">
        {s.footer_text && <p className="mb-2 max-w-3xl">{s.footer_text}</p>}
        <p>
          © {new Date().getFullYear()} {s.store_name}
          {company.length > 0 && <> · Responsável: {company.join(" · ")}</>}
        </p>
      </div>
    </footer>
  );
}
