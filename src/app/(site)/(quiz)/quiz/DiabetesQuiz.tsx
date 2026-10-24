"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { metaEvent } from "@/lib/client/tracking";

/** Quiz de captação (client-side). Fluxo: intro → 5 perguntas → loader → e-mail → resultado + oferta. */

const QUESTIONS: { q: string; options: string[] }[] = [
  { q: "Você convive com qual tipo?", options: ["Tipo 2", "Tipo 1", "Pré-diabetes", "Ainda não sei / é pra outra pessoa"] },
  {
    q: "Qual é a parte mais difícil pra você hoje?",
    options: ["Não saber o que cozinhar que não suba a glicose", "Enjoar de comer sempre a mesma coisa", "Sentir falta de doce", "Cozinhar pra família e pra mim ao mesmo tempo"],
  },
  { q: "Quando bate a vontade de um doce, você…", options: ["Como e fico com medo depois", "Resisto e fico mal-humorado(a)", "Já desisti, nem chego perto", "Depende do dia"] },
  { q: "Quem come as suas refeições?", options: ["Só eu", "Eu e meu/minha companheiro(a)", "A família toda", "Eu cozinho pra outra pessoa com diabetes"] },
  { q: "Há quanto tempo isso faz parte da sua vida?", options: ["Faz pouco, ainda tô me achando", "Alguns anos", "Faz tempo, já é rotina", "Acabei de descobrir"] },
];

function resultTitle(p2: number | null): string {
  if (p2 === 0) return "O seu problema não é força de vontade. É cardápio.";
  if (p2 === 1) return "Dá pra variar o prato todo dia sem sair do controle. Só falta o roteiro.";
  if (p2 === 2) return "Boa notícia: você não precisa cortar o doce. Precisa do doce certo.";
  if (p2 === 3) return "Dá pra cuidar da sua diabetes e alimentar a família na mesma panela.";
  return "O seu problema não é força de vontade. É cardápio.";
}

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

type Screen = "intro" | number | "loading" | "email" | "result";

export function DiabetesQuiz() {
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>("intro");
  const [answers, setAnswers] = useState<(number | null)[]>(Array(QUESTIONS.length).fill(null));
  const [email, setEmail] = useState("");
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // Loader: após 2,6s vai para a captura de e-mail
  useEffect(() => {
    if (screen !== "loading") return;
    const t = setTimeout(() => setScreen("email"), 2600);
    return () => clearTimeout(t);
  }, [screen]);

  const answer = (qi: number, oi: number) => {
    const next = [...answers];
    next[qi] = oi;
    setAnswers(next);
    setTimeout(() => setScreen(qi + 1 < QUESTIONS.length ? qi + 1 : "loading"), 180);
  };

  const submitEmail = () => {
    if (!emailOk(email)) {
      setEmailErr("Digite um e-mail válido.");
      return;
    }
    setEmailErr(null);
    setSending(true);
    const respostas = QUESTIONS.map((q, i) => ({ pergunta: q.q, resposta: answers[i] != null ? q.options[answers[i]!] : null }));
    const url = process.env.NEXT_PUBLIC_LEAD_WEBHOOK;
    if (url) {
      fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim(), origem: "quiz-diabetes", respostas }) }).catch(() => {});
    }
    try {
      metaEvent("Lead", { content_name: "quiz_diabetes" });
    } catch {
      /* pixel opcional */
    }
    setTimeout(() => setScreen("result"), 350);
  };

  const goToOffer = () => router.push(`/e-book?email=${encodeURIComponent(email.trim())}#oferta`);

  const wrap = "mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-5 py-8 text-center";

  // ─── Intro ───
  if (screen === "intro") {
    return (
      <div className={wrap}>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">Diabetes à Mesa</p>
        <h1 className="mt-5 font-display text-[1.9rem] leading-tight text-ink sm:text-4xl">
          Responda 5 perguntas rápidas e veja como comer o que você gosta <em className="text-primary not-italic underline decoration-accent decoration-2 underline-offset-4">sem o aparelhinho apitar alto</em>.
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-ink/75">Leva menos de 1 minuto. No fim, você recebe um guia gratuito com 3 sobremesas que não disparam a glicemia.</p>
        <button onClick={() => setScreen(0)} className="btn-primary mx-auto mt-8 w-full max-w-sm text-base">Começar</button>
      </div>
    );
  }

  // ─── Loader ───
  if (screen === "loading") {
    return (
      <div className={wrap}>
        <div className="mx-auto mb-6 h-12 w-12 animate-spin rounded-full border-4 border-line border-t-primary" aria-hidden="true" />
        <h2 className="font-display text-2xl text-ink sm:text-3xl">Montando um plano de pratos com base no que você respondeu…</h2>
        <ul className="mx-auto mt-6 space-y-2 text-left text-[15px] text-muted">
          <li className="animate-rise">→ encontrando receitas de baixo índice glicêmico</li>
          <li className="animate-rise" style={{ animationDelay: "0.5s" }}>→ separando as opções de doce liberado</li>
          <li className="animate-rise" style={{ animationDelay: "1s" }}>→ pronto.</li>
        </ul>
      </div>
    );
  }

  // ─── Captura de e-mail ───
  if (screen === "email") {
    return (
      <div className={wrap}>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">Quase lá</p>
        <h2 className="mt-4 font-display text-[1.7rem] leading-tight text-ink sm:text-3xl">Seu resultado está pronto. Pra onde eu envio?</h2>
        <p className="mt-4 text-lg leading-relaxed text-ink/75">
          Digita seu melhor e-mail que eu te mostro o resultado aqui na tela <strong>e</strong> te mando de presente o guia com <strong>3 sobremesas que não disparam a glicemia</strong> — pra você testar hoje mesmo.
        </p>
        <div className="mx-auto mt-6 w-full max-w-sm text-left">
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitEmail()}
            placeholder="seuemail@exemplo.com"
            className="w-full rounded-2xl border border-line bg-surface px-4 py-3.5 text-lg text-ink outline-none focus:border-primary"
            aria-label="Seu e-mail"
          />
          {emailErr && <p className="mt-2 text-sm text-danger" role="alert">{emailErr}</p>}
          <button onClick={submitEmail} disabled={sending} className="btn-primary mt-3 w-full text-base">{sending ? "Enviando…" : "Ver meu resultado"}</button>
          <p className="mt-3 text-center text-sm text-muted">Só vou te mandar coisa útil sobre comer bem com diabetes. Zero spam. Sai quando quiser.</p>
        </div>
      </div>
    );
  }

  // ─── Resultado + oferta ───
  if (screen === "result") {
    return (
      <div className={wrap}>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">O seu resultado</p>
        <h2 className="mt-4 font-display text-[1.8rem] leading-tight text-ink sm:text-4xl">{resultTitle(answers[1])}</h2>
        <div className="mx-auto mt-6 max-w-lg space-y-4 text-left text-[1.0625rem] leading-relaxed text-ink/80">
          <p>Olha, quase todo mundo que responde esse quiz cai na mesma armadilha: depois do diagnóstico, cortou tudo, ficou no arroz com frango e numa semana já tava de saco cheio. Aí relaxa, come um pão de queijo, o aparelho aponta 170 e vem a culpa.</p>
          <p>O problema nunca foi você. É que te falaram o que <strong>não</strong> comer e ninguém te deu o cardápio do que <strong>pode</strong>.</p>
          <p>Foi pra isso que eu montei o <strong>Diabetes à Mesa</strong>: mais de 250 receitas organizadas por refeição — café, almoço, jantar, lanche e sim, sobremesa — todas pensadas pra não disparar a glicemia. Comida de verdade, ingrediente de mercado, modo de preparo curto.</p>
          <p className="text-secondary">Enquanto você lê isso, seu guia das 3 sobremesas já tá indo pro seu e-mail. Mas se você já quer o cardápio completo, é aqui embaixo.</p>
        </div>
        <button onClick={goToOffer} className="btn-primary mx-auto mt-8 w-full max-w-sm text-base">Quero o cardápio completo</button>
        <p className="mt-4 text-sm text-muted">Acesso na hora, via PIX. 7 dias de garantia — não gostou, devolvo.</p>
      </div>
    );
  }

  // ─── Perguntas ───
  const qi = screen as number;
  const current = QUESTIONS[qi];
  const progress = Math.round(((qi + 1) / QUESTIONS.length) * 100);
  return (
    <div className="flex flex-1 flex-col">
      <div className="h-1.5 w-full bg-line" aria-hidden="true">
        <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
      </div>
      <div className={wrap}>
        <p className="text-sm font-semibold text-secondary">Pergunta {qi + 1} de {QUESTIONS.length}</p>
        <h2 className="mt-3 font-display text-[1.6rem] leading-snug text-ink sm:text-3xl">{current.q}</h2>
        <div className="mx-auto mt-7 flex w-full max-w-md flex-col gap-3">
          {current.options.map((opt, oi) => (
            <button
              key={oi}
              onClick={() => answer(qi, oi)}
              className={`w-full rounded-2xl border-2 px-5 py-4 text-left text-lg font-medium transition ${answers[qi] === oi ? "border-primary bg-primary/[0.07] text-ink" : "border-line bg-surface text-ink hover:border-primary/50 hover:shadow-soft"}`}
            >
              {opt}
            </button>
          ))}
        </div>
        {qi > 0 && (
          <button onClick={() => setScreen(qi - 1)} className="mx-auto mt-6 text-sm font-semibold text-muted underline-offset-4 hover:underline">← Voltar</button>
        )}
      </div>
    </div>
  );
}
