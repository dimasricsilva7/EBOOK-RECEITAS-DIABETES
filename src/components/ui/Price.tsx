import { formatBRL } from "@/utils/format";

/** Preço com "de" riscado apenas quando o admin configurou um preço de referência maior. */
export function Price({ priceCents, listPriceCents, size = "md", className = "" }: { priceCents: number; listPriceCents?: number | null; size?: "sm" | "md" | "lg"; className?: string }) {
  const main = size === "lg" ? "text-4xl" : size === "sm" ? "text-lg" : "text-3xl";
  return (
    <div className={`flex flex-wrap items-baseline gap-x-2 ${className}`}>
      {listPriceCents && listPriceCents > priceCents ? (
        <span className="text-sm text-muted line-through" aria-label={`Preço anterior ${formatBRL(listPriceCents)}`}>
          {formatBRL(listPriceCents)}
        </span>
      ) : null}
      <span className={`font-display tabular-nums tracking-tight ${main}`}>{formatBRL(priceCents)}</span>
    </div>
  );
}
