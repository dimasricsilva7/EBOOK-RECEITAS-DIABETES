/** Regras do quiz (navegação por regras, resultado editorial, empate) e de status pago. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeResult, rankResults, nextQuestionId, pathFor, QUIZ_TEXT_DEFAULTS, type QuizData } from "../src/lib/quiz";
import { isPaidStatus } from "../src/lib/domain";

const data: QuizData = {
  texts: { ...QUIZ_TEXT_DEFAULTS, fallbackResultKey: "variadas" },
  results: ["estresse", "emocoes", "culpa", "variadas"].map((key) => ({ key, title: key, subtitle: null, body: null, points: [], ctaLabel: null, ctaTarget: null })),
  questions: [
    { id: "q1", title: "Q1", helpText: null, type: "single", required: true, options: [{ id: "a", label: "A", resultKey: "estresse", weight: 1, nextQuestionId: null }, { id: "b", label: "B", resultKey: "emocoes", weight: 1, nextQuestionId: "q3" }, { id: "x", label: "X", resultKey: null, weight: 1, nextQuestionId: "END" }] },
    { id: "q2", title: "Q2", helpText: null, type: "single", required: true, options: [{ id: "c", label: "C", resultKey: "estresse", weight: 2, nextQuestionId: null }, { id: "d", label: "D", resultKey: "culpa", weight: 1, nextQuestionId: null }] },
    { id: "q3", title: "Q3", helpText: null, type: "multiple", required: false, options: [{ id: "e", label: "E", resultKey: "culpa", weight: 1, nextQuestionId: null }, { id: "f", label: "F", resultKey: "emocoes", weight: 1, nextQuestionId: null }] },
  ],
};

test("quiz: segue a ordem quando não há regra", () => {
  assert.equal(nextQuestionId(data, "q1", ["a"]), "q2");
  assert.equal(nextQuestionId(data, "q2", ["c"]), "q3");
  assert.equal(nextQuestionId(data, "q3", ["e"]), null, "última pergunta → fim");
});

test("quiz: regra de navegação pula pergunta ou encerra", () => {
  assert.equal(nextQuestionId(data, "q1", ["b"]), "q3");
  assert.equal(nextQuestionId(data, "q1", ["x"]), null);
  assert.deepEqual(pathFor(data, { q1: ["b"], q3: ["e"] }), ["q1", "q3"]);
});

test("quiz: resultado pela soma dos pesos", () => {
  assert.deepEqual(rankResults(data, { q1: ["a"], q2: ["c"] }), { key: "estresse", secondaryKey: null });
  assert.deepEqual(rankResults(data, { q1: ["b"], q3: ["e"], q2: ["d"] }), { key: "culpa", secondaryKey: null }, "culpa 2 × emocoes 1 → só culpa");
});

test("quiz: temas se combinam (empate entre dois ou segundo tema próximo)", () => {
  assert.deepEqual(rankResults(data, { q1: ["b"], q3: ["f", "e"], q2: ["d"] }), { key: "emocoes", secondaryKey: "culpa" }, "emocoes 2 × culpa 2 → os dois");
  assert.deepEqual(rankResults(data, { q1: ["a"], q2: ["d"] }), { key: "estresse", secondaryKey: "culpa" });
  assert.deepEqual(rankResults(data, { q1: ["b"], q2: ["c"], q3: ["f"] }), { key: "estresse", secondaryKey: "emocoes" }, "estresse 2 × emocoes 2");
});

test("quiz: sem pontuação ou empate triplo → resultado padrão (sem rotular)", () => {
  assert.equal(computeResult(data, {}), "variadas");
  assert.equal(computeResult(data, { q1: ["x"] }), "variadas");
  const triple: QuizData = { ...data, questions: [...data.questions, { id: "q4", title: "Q4", helpText: null, type: "single", required: false, options: [{ id: "g", label: "G", resultKey: "culpa", weight: 1, nextQuestionId: null }] }] };
  assert.deepEqual(rankResults(triple, { q1: ["a"], q3: ["f"], q4: ["g"] }), { key: "variadas", secondaryKey: null });
});

test("acesso: só status pagos liberam materiais", () => {
  assert.equal(isPaidStatus("PAID"), true);
  assert.equal(isPaidStatus("CREDIARIO_APROVADO"), true);
  for (const s of ["PENDING", "PIX_GENERATED", "EXPIRED", "REFUNDED", "CHARGEBACK", "CREDIARIO_PENDENTE"]) assert.equal(isPaidStatus(s), false, s);
});
