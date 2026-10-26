import type { Metadata } from "next";
import { DiabetesQuiz } from "./DiabetesQuiz";
import { getSettingsFresh } from "@/server/settings";
import { parseQuizQuestions } from "@/lib/quiz-config";

export const metadata: Metadata = {
  title: { absolute: "Diabetes à Mesa — veja como comer o que você gosta sem a glicemia subir" },
  description: "Responda algumas perguntas rápidas e descubra como variar o cardápio comendo bem, mesmo com diabetes. Leva menos de 1 minuto e você recebe um guia gratuito de sobremesas.",
  alternates: { canonical: "/quiz" },
};
export const dynamic = "force-dynamic";

/** Quiz de captação de leads do Diabetes à Mesa. As perguntas vêm do admin (Setting quiz_questions_text). */
export default async function QuizPage() {
  const s = await getSettingsFresh();
  const questions = parseQuizQuestions(s.quiz_questions_text);
  return <DiabetesQuiz questions={questions} />;
}
