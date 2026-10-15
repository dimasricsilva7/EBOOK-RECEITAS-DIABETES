/**
 * Testes A/B — atribuição determinística por visitor_id: o mesmo visitante vê
 * sempre a mesma variante, e o servidor recalcula a mesma variante no checkout
 * (o preço de um teste nunca vem do navegador).
 *
 * Alvos suportados (Experiment.target):
 *   hero_headline · hero_cta · hero_image · featured_kit · section_order · order_bump
 *   price:<productId>  (value = preço em centavos)
 */
export type ExperimentVariant = { key: string; label?: string; weight: number; value: string };
export type ExperimentDef = { key: string; target: string; variants: ExperimentVariant[] };
export type Assignment = { experimentKey: string; target: string; variantKey: string; value: string };

/** Hash FNV-1a de 32 bits (estável, sem dependências, igual no browser e no servidor). */
export function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function assignVariant(visitorId: string, exp: ExperimentDef): ExperimentVariant | null {
  const variants = exp.variants.filter((v) => v.weight > 0);
  if (!variants.length || !visitorId) return null;
  const total = variants.reduce((s, v) => s + v.weight, 0);
  const bucket = fnv1a(`${exp.key}:${visitorId}`) % total;
  let acc = 0;
  for (const v of variants) {
    acc += v.weight;
    if (bucket < acc) return v;
  }
  return variants[variants.length - 1];
}

export function assignAll(visitorId: string | null | undefined, experiments: ExperimentDef[]): Assignment[] {
  if (!visitorId) return [];
  return experiments.flatMap((e) => {
    const v = assignVariant(visitorId, e);
    return v ? [{ experimentKey: e.key, target: e.target, variantKey: v.key, value: v.value }] : [];
  });
}

export const assignmentMap = (list: Assignment[]) => Object.fromEntries(list.map((a) => [a.experimentKey, a.variantKey]));

export function valueFor(list: Assignment[], target: string): string | null {
  const a = list.find((x) => x.target === target);
  return a && a.value ? a.value : null;
}

/** Overrides de preço vindos de testes A/B ativos: { productId: cents } */
export function priceOverrides(list: Assignment[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of list) {
    if (!a.target.startsWith("price:")) continue;
    const cents = Number.parseInt(a.value, 10);
    if (Number.isFinite(cents) && cents >= 500) out[a.target.slice(6)] = cents;
  }
  return out;
}
