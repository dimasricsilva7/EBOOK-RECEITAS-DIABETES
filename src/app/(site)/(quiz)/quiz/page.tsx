import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentAdmin } from "@/lib/auth";
import { getMainProduct } from "@/server/catalog";
import { buildDraftQuiz, getPublishedQuiz } from "@/server/quiz";
import { QuizClient, type QuizProduct } from "./QuizClient";

export const metadata: Metadata = {
  title: { absolute: "Além da Fome — o que a comida representa nos seus momentos mais difíceis?" },
  description: "Responda a 5 perguntas rápidas para observar sua relação com a comida e reconhecer possíveis padrões. Autoconhecimento, sem julgamentos e sem diagnóstico.",
  alternates: { canonical: "/" },
};
export const dynamic = "force-dynamic";

async function mainProduct(): Promise<QuizProduct | null> {
  const p = await getMainProduct().catch(() => null);
  return p ? { name: p.name, subtitle: p.subtitle, shortDescription: p.shortDescription, imageUrl: p.imageUrl, priceCents: p.priceCents, deliveryFormat: p.deliveryFormat } : null;
}

/**
 * Quiz público (versão publicada) — é a entrada do funil em "/" e também responde em "/quiz".
 * ?preview=1 mostra o RASCUNHO, só para administradores logados.
 */
export default async function QuizPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const { preview } = await searchParams;
  const product = await mainProduct();
  if (preview === "1") {
    const admin = await getCurrentAdmin();
    if (admin) {
      const draft = await buildDraftQuiz();
      return <QuizClient data={draft} versionId="preview" preview product={product} />;
    }
  }
  const published = await getPublishedQuiz();
  if (!published || !published.data.questions.length) {
    return (
      <div className="container-page max-w-lg py-24 text-center">
        <h1 className="h-section">O quiz volta em breve</h1>
        <p className="lead mt-4">Enquanto isso, você pode conhecer o e-book Além da Fome.</p>
        <Link href="/e-book" className="btn-primary mt-8">Conhecer o e-book</Link>
      </div>
    );
  }
  return <QuizClient data={published.data} versionId={published.id} product={product} />;
}
