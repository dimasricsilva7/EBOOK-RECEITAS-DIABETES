import { Icon } from "@/components/ui/Icon";

/** Selos verdadeiros do checkout: conexão segura, dados protegidos, entrega digital e responsável (se preenchido). */
export function TrustSeals({ cnpj, companyName, securityText }: { cnpj: string | null; companyName: string | null; securityText?: string }) {
  const seals: { icon: string; title: string; sub: string }[] = [
    { icon: "shield", title: "Conexão segura", sub: "Dados trafegam criptografados" },
    { icon: "lock", title: "Dados protegidos", sub: "Usados só para o seu pedido" },
    { icon: "mail", title: "Acesso por e-mail", sub: "Após a confirmação do pagamento" },
  ];
  return (
    <div className="rounded-2xl border border-line bg-surface/70 p-4">
      <ul className="grid grid-cols-3 gap-2 text-center">
        {seals.map((s) => (
          <li key={s.title} className="flex flex-col items-center gap-1.5 px-1">
            <Icon name={s.icon} className="h-5 w-5 text-secondary" />
            <span className="text-[12px] font-semibold leading-tight text-ink">{s.title}</span>
            <span className="hidden text-[11px] leading-tight text-muted sm:block">{s.sub}</span>
          </li>
        ))}
      </ul>
      {securityText && <p className="mt-3 border-t border-line pt-3 text-center text-[12px] leading-snug text-muted">{securityText}</p>}
      {(companyName || cnpj) && (
        <p className="mt-2 text-center text-[11px] leading-tight text-muted">
          Vendido por {companyName || "responsável pelo produto"}
          {cnpj ? ` · ${cnpj.replace(/\D/g, "").length > 11 ? "CNPJ" : "CPF/CNPJ"} ${cnpj}` : ""}
        </p>
      )}
    </div>
  );
}
