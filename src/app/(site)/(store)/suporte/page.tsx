import type { Metadata } from "next";
import Link from "next/link";
import { whatsappLink } from "@/components/layout/Footer";
import { getSettings } from "@/server/settings";
import { SupportForm } from "./SupportForm";

export const metadata: Metadata = { title: "Suporte", description: "Fale com o suporte do Diabetes à Mesa." };

export default async function SupportPage() {
  const s = await getSettings();
  const wa = s.whatsapp ? whatsappLink(s.whatsapp, "Olá! Preciso de ajuda com o Diabetes à Mesa.") : null;
  return (
    <section className="container-page grid max-w-5xl gap-12 py-16 sm:py-24 lg:grid-cols-[0.9fr_1.1fr]">
      <div>
        <p className="eyebrow">Suporte</p>
        <h1 className="mt-4 h-section">Como podemos ajudar?</h1>
        <p className="lead mt-4">Dúvidas sobre acesso, pagamento ou reembolso? Escreva para a gente — respondemos pelo e-mail informado.</p>
        <ul className="mt-8 space-y-3 text-sm">
          <li><Link href="/acesso" className="font-semibold text-primary underline-offset-4 hover:underline">Perdi meu link de acesso</Link></li>
          <li><Link href="/trocas-e-devolucoes" className="font-semibold text-primary underline-offset-4 hover:underline">Política de reembolso</Link></li>
          {wa && <li><a href={wa} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary underline-offset-4 hover:underline">WhatsApp</a></li>}
          {s.contact_email && <li className="text-muted">E-mail: <a href={`mailto:${s.contact_email}`} className="text-ink underline-offset-4 hover:underline">{s.contact_email}</a></li>}
          {s.support_hours && <li className="text-muted">{s.support_hours}</li>}
        </ul>
        <p className="mt-8 rounded-2xl bg-sand/70 p-4 text-xs leading-relaxed text-muted">
          Este canal é para suporte do produto. Se você está passando por sofrimento intenso, procure um profissional de saúde. Em situação de crise, ligue 188 (CVV, gratuito, 24h) ou 192 (SAMU).
        </p>
      </div>
      <SupportForm />
    </section>
  );
}
