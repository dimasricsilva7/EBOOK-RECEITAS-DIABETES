import type { Metadata } from "next";
import Link from "next/link";
import { AccessForm } from "./AccessForm";

export const metadata: Metadata = { title: "Meu acesso", description: "Receba de novo o link de acesso aos seus materiais.", robots: { index: false, follow: true } };

export default function AccessPage() {
  return (
    <section className="container-page max-w-lg py-16 sm:py-24">
      <p className="eyebrow">Área da cliente</p>
      <h1 className="mt-4 h-section">Recuperar meu acesso</h1>
      <p className="lead mt-4">Informe o e-mail usado na compra. Se houver um pagamento confirmado, enviamos o link dos seus materiais para ele.</p>
      <AccessForm />
      <p className="mt-8 text-sm text-muted">
        Não recebeu? Confira a caixa de spam ou <Link href="/suporte" className="font-semibold text-primary underline-offset-4 hover:underline">fale com o suporte</Link>.
      </p>
    </section>
  );
}
