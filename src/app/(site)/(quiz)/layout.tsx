import Link from "next/link";
import { Logo } from "@/components/layout/Logo";
import { getSettings } from "@/server/settings";

/** Layout enxuto do quiz (sem menu, foco total nas perguntas). */
export default async function QuizLayout({ children }: { children: React.ReactNode }) {
  const s = await getSettings();
  return (
    <div className="flex min-h-[100svh] flex-col bg-bg">
      <header className="border-b border-line/70">
        <div className="container-page flex h-16 items-center justify-between">
          <Link href="/" aria-label={`${s.store_name} — início`}>
            <Logo name={s.store_name} logoUrl={s.logo_url || null} />
          </Link>
          <Link href="/politica-de-privacidade" className="text-xs font-medium text-muted underline-offset-4 hover:underline">Privacidade</Link>
        </div>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
