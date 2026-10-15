/* eslint-disable @next/next/no-img-element */
/** Logo das Configurações (upload ou link). Sem logo → marca tipográfica em serifa. */
export function Logo({ name, logoUrl, light = false }: { name: string; logoUrl: string | null; light?: boolean }) {
  if (logoUrl) return <img src={logoUrl} alt={name} className="h-8 w-auto sm:h-9" decoding="async" />;
  return (
    <span className={`font-display text-[1.45rem] leading-none tracking-tight ${light ? "text-bg" : "text-ink"}`}>
      {name.includes(" ") ? (
        <>
          {name.split(" ").slice(0, -1).join(" ")} <em className={light ? "text-accent" : "text-primary"}>{name.split(" ").at(-1)}</em>
        </>
      ) : (
        name
      )}
    </span>
  );
}
