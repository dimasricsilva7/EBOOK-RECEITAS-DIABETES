import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-4 text-center">
      <p className="eyebrow">Erro 404</p>
      <h1 className="mt-4 font-display text-4xl">Página não encontrada</h1>
      <p className="mt-3 text-muted">O endereço pode ter mudado. Volte ao início para continuar.</p>
      <Link href="/" className="btn-primary mt-8">Ir para o início</Link>
    </div>
  );
}
