import { Card, PageHeader, textareaCls } from "@/components/admin/ui";
import { ActionForm, SubmitButton } from "@/components/admin/client";
import { getSettingsFresh } from "@/server/settings";
import { DEFAULT_QUESTIONS, parseQuizQuestions, serializeQuizQuestions } from "@/lib/quiz-config";
import { saveSettings } from "../sistema-actions";

export const metadata = { title: "Perguntas do quiz" };

export default async function QuizQuestionsPage() {
  const s = await getSettingsFresh();
  const current = (s.quiz_questions_text || "").trim();
  const value = current || serializeQuizQuestions(DEFAULT_QUESTIONS);
  const count = parseQuizQuestions(value).length;
  return (
    <div className="space-y-6">
      <PageHeader title="Perguntas do quiz" description={`${count} pergunta(s) ativas no /quiz. Edite livremente: uma pergunta por bloco, as opções começando com "- ", e uma linha em branco separando as perguntas.`} />
      <Card title="Editar perguntas">
        <ActionForm action={saveSettings} className="space-y-3">
          <input type="hidden" name="__keys" value="quiz_questions_text" />
          <textarea name="quiz_questions_text" rows={22} defaultValue={value} className={`${textareaCls} font-mono text-[13px] leading-relaxed`} spellCheck={false} />
          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            <p className="font-semibold">Formato:</p>
            <pre className="mt-1 whitespace-pre-wrap">{`Você convive com qual tipo de diabetes?
- Tipo 2
- Tipo 1
- Pré-diabetes

Qual a sua faixa de idade?
- Até 29 anos
- 30 a 44 anos`}</pre>
            <p className="mt-2">Cada pergunta precisa de pelo menos 2 opções. Para desativar uma pergunta, é só apagá-la (ou removê-la do texto). Deixe tudo em branco e salve para voltar às perguntas padrão.</p>
          </div>
          <SubmitButton>Salvar perguntas</SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
