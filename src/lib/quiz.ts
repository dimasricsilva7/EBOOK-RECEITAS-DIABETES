/**
 * Quiz — tipos e regras puras (navegador, servidor e testes).
 * Os resultados são EDITORIAIS: reconhecem o que a pessoa compartilhou e sugerem conteúdo educativo.
 * Nunca são diagnóstico, classificação clínica ou recomendação médica.
 */

export type QuizOptionData = { id: string; label: string; resultKey: string | null; weight: number; nextQuestionId: string | null };
export type QuizQuestionData = { id: string; title: string; helpText: string | null; type: "single" | "multiple"; required: boolean; options: QuizOptionData[] };
export type QuizResultData = { key: string; title: string; subtitle: string | null; body: string | null; points: string[]; reflection?: string | null; exercise?: string | null; ctaLabel: string | null; ctaTarget: string | null };

export type QuizTexts = {
  introEyebrow: string;
  introTitle: string;
  introText: string;
  introButton: string;
  introNote: string;
  introTime: string;
  consentText: string;
  privacyNote: string;
  leadEnabled: boolean;
  leadRequired: boolean;
  leadTitle: string;
  leadText: string;
  leadButton: string;
  leadSkipLabel: string;
  marketingConsentLabel: string;
  resultEyebrow: string;
  resultDisclaimer: string;
  fallbackResultKey: string;
};

export type QuizData = { questions: QuizQuestionData[]; results: QuizResultData[]; texts: QuizTexts };

export const QUIZ_TEXT_DEFAULTS: QuizTexts = {
  introEyebrow: "Um momento só seu",
  introTitle: "O que a comida representa nos seus momentos mais difíceis?",
  introText:
    "Responda a 5 perguntas rápidas para observar sua relação com a comida, reconhecer possíveis padrões e descobrir por onde começar a se compreender melhor.",
  introNote: "Uma experiência de autoconhecimento. Sem respostas certas ou erradas, sem julgamentos e sem diagnóstico.",
  introButton: "Começar meu quiz",
  introTime: "Leva cerca de 1–2 minutos.",
  consentText:
    "Concordo que minhas respostas sejam usadas somente para montar o meu resultado, conforme a Política de Privacidade. Elas não são compartilhadas com plataformas de anúncios.",
  privacyNote: "Suas respostas ficam protegidas e você pode pedir a exclusão a qualquer momento.",
  leadEnabled: true,
  leadRequired: false,
  leadTitle: "Quer receber o seu resultado por e-mail?",
  leadText:
    "É opcional. Se você informar nome e e-mail, enviamos uma cópia do seu resultado — e usamos esses dados só para isso. Novidades por e-mail apenas se você marcar a opção abaixo.",
  leadButton: "Enviar e ver meu resultado",
  leadSkipLabel: "Ver meu resultado sem informar e-mail",
  marketingConsentLabel: "Quero receber conteúdos e novidades do Além da Fome por e-mail (opcional).",
  resultEyebrow: "O seu resultado",
  resultDisclaimer:
    "Este resultado é um conteúdo educativo baseado nas suas respostas. Não é diagnóstico e não substitui avaliação, acompanhamento ou tratamento com profissionais de saúde (psicologia, nutrição ou medicina).",
  fallbackResultKey: "variadas",
};

/** Próxima pergunta: regra da opção escolhida (pergunta única) ou a seguinte na ordem. null = fim. */
export function nextQuestionId(data: QuizData, currentId: string, chosenOptionIds: string[]): string | null {
  const idx = data.questions.findIndex((q) => q.id === currentId);
  if (idx < 0) return data.questions[0]?.id ?? null;
  const q = data.questions[idx];
  const ruled = q.options.find((o) => chosenOptionIds.includes(o.id) && o.nextQuestionId);
  if (ruled?.nextQuestionId === "END") return null;
  if (ruled?.nextQuestionId && data.questions.some((x) => x.id === ruled.nextQuestionId)) return ruled.nextQuestionId;
  return data.questions[idx + 1]?.id ?? null;
}

/**
 * Resultado editorial: soma os pesos de cada chave nas opções escolhidas. Os temas podem se combinar:
 * - um tema à frente → principal; o segundo aparece como tema complementar quando chega perto (≥ 2 pontos e no máximo 1 atrás);
 * - empate entre dois → os dois aparecem (o primeiro na ordem dos resultados é o principal);
 * - nenhuma pontuação ou empate entre três ou mais → resultado padrão, que não força um rótulo sobre a pessoa.
 */
export function rankResults(data: QuizData, answers: Record<string, string[]>): { key: string; secondaryKey: string | null } {
  const order = data.results.map((r) => r.key);
  const valid = new Set(order);
  const fallback = valid.has(data.texts.fallbackResultKey) ? data.texts.fallbackResultKey : (order[0] ?? "");
  const score = new Map<string, number>();
  for (const q of data.questions) {
    const chosen = answers[q.id] ?? [];
    for (const o of q.options) {
      if (!chosen.includes(o.id) || !o.resultKey || !valid.has(o.resultKey)) continue;
      score.set(o.resultKey, (score.get(o.resultKey) ?? 0) + Math.max(0, o.weight));
    }
  }
  const ranked = [...score.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1] || order.indexOf(a[0]) - order.indexOf(b[0]));
  if (!ranked.length) return { key: fallback, secondaryKey: null };
  const [first, second, third] = ranked;
  if (second && third && first[1] === second[1] && second[1] === third[1]) return { key: fallback, secondaryKey: null };
  const close = Boolean(second) && (second[1] === first[1] || (second[1] >= 2 && first[1] - second[1] <= 1));
  return { key: first[0], secondaryKey: close && second[0] !== first[0] ? second[0] : null };
}

export function computeResult(data: QuizData, answers: Record<string, string[]>): string {
  return rankResults(data, answers).key;
}

/** Caminho percorrido pelas regras (usado para progresso e validação de "obrigatórias"). */
export function pathFor(data: QuizData, answers: Record<string, string[]>): string[] {
  const path: string[] = [];
  let cur: string | null = data.questions[0]?.id ?? null;
  const guard = new Set<string>();
  while (cur && !guard.has(cur)) {
    guard.add(cur);
    path.push(cur);
    const chosen = answers[cur];
    if (!chosen?.length) {
      const q = data.questions.find((x) => x.id === cur);
      if (q?.required) break;
    }
    cur = nextQuestionId(data, cur, chosen ?? []);
  }
  return path;
}
