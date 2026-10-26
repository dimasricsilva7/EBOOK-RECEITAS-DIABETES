export type QuizQ = { q: string; options: string[] };

/** Perguntas padrão do quiz (usadas quando o admin não editou nada). */
export const DEFAULT_QUESTIONS: QuizQ[] = [
  { q: "Você convive com qual tipo de diabetes?", options: ["Tipo 2", "Tipo 1", "Pré-diabetes", "Ainda não sei / é pra outra pessoa"] },
  { q: "Você é:", options: ["Mulher", "Homem", "Prefiro não dizer"] },
  { q: "Qual a sua faixa de idade?", options: ["Até 29 anos", "30 a 44 anos", "45 a 59 anos", "60 anos ou mais"] },
  { q: "Há quanto tempo isso faz parte da sua vida?", options: ["Acabei de descobrir", "Menos de 1 ano", "De 1 a 5 anos", "Mais de 5 anos"] },
  { q: "Qual é a sua MAIOR dificuldade hoje?", options: ["Não saber o que cozinhar que não suba a glicose", "Enjoar de comer sempre a mesma coisa", "Sentir falta de doce", "Cozinhar pra família e pra mim ao mesmo tempo"] },
  { q: "Você já tentou cortar alimentos ou fazer dieta e não conseguiu manter?", options: ["Sim, várias vezes", "Sim, uma vez ou outra", "Consigo manter, mas é um sofrimento", "Nunca tentei de verdade"] },
  { q: "O que você mais EVITA comer com medo da glicemia subir?", options: ["Doces e sobremesas", "Pães, bolos e massas", "Frutas", "Sinceramente, não sei direito o que evitar"] },
  { q: "E o que você mais SENTE FALTA de comer?", options: ["Doce", "Pão, bolo e massa", "Um lanche prático", "Um pouco de tudo"] },
  { q: "O que você mais quer conquistar agora?", options: ["Variar as refeições sem medo", "Comer doce sem culpa", "Facilitar a minha rotina na cozinha", "Ajudar no controle da glicemia"] },
  { q: "Quem come as suas refeições?", options: ["Só eu", "Eu e meu/minha companheiro(a)", "A família toda", "Cozinho pra outra pessoa com diabetes"] },
  { q: "Se existisse um material com mais de 250 receitas liberadas e fáceis de fazer, você…", options: ["Começaria hoje mesmo", "Com certeza ia querer conhecer", "Toparia, dependendo do preço", "Ia pensar com calma"] },
];

/**
 * Formato de edição no admin (texto simples):
 *   Pergunta?
 *   - Opção A
 *   - Opção B
 *   (linha em branco entre as perguntas)
 */
export function parseQuizQuestions(text: string | null | undefined): QuizQ[] {
  if (!text || !text.trim()) return [];
  const out: QuizQ[] = [];
  for (const block of text.split(/\n\s*\n/)) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    const q = lines[0].replace(/^\d+[).\s-]*/, "").trim();
    const options = lines.slice(1).filter((l) => /^[-*•]/.test(l)).map((l) => l.replace(/^[-*•]\s?/, "").trim()).filter(Boolean).slice(0, 6);
    if (q && options.length >= 2) out.push({ q, options });
  }
  return out.slice(0, 15);
}

export function serializeQuizQuestions(qs: QuizQ[]): string {
  return qs.map((x) => `${x.q}\n${x.options.map((o) => `- ${o}`).join("\n")}`).join("\n\n");
}
