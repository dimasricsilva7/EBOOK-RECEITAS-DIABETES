import type { Metadata } from "next";
import { DiabetesQuiz } from "./DiabetesQuiz";

export const metadata: Metadata = {
  title: { absolute: "Diabetes à Mesa — veja como comer o que você gosta sem a glicemia subir" },
  description: "Responda 5 perguntas rápidas e descubra como variar o cardápio comendo bem, mesmo com diabetes. Leva menos de 1 minuto e você recebe um guia gratuito de sobremesas.",
  alternates: { canonical: "/quiz" },
};
export const dynamic = "force-dynamic";

/** Quiz de captação de leads do Diabetes à Mesa (client-side). */
export default function QuizPage() {
  return <DiabetesQuiz />;
}
