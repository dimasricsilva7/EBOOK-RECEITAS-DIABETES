"use client";

import Link from "next/link";
import { useEffect } from "react";

/** Nunca deixar o usuário em tela branca. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(JSON.stringify({ level: "error", scope: "ui", message: error.message, digest: error.digest }));
  }, [error]);
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
      <p className="font-pixel text-sm text-accent">ERRO</p>
      <h1 className="mt-2 font-display text-3xl font-extrabold">Algo não saiu como esperado</h1>
      <p className="mt-3 text-muted">Tente novamente em instantes. Se o problema continuar, fale com o nosso atendimento.</p>
      <div className="mt-6 flex gap-2">
        <button onClick={reset} className="btn-primary">Tentar novamente</button>
        <Link href="/" className="btn-light">Início</Link>
      </div>
    </div>
  );
}
