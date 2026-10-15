import type { EmailOrder } from "./templates";

/** Dados de exemplo (claramente fictícios) para visualizar os templates antes do primeiro pedido. */
export function sampleOrder(): EmailOrder {
  return {
    orderNumber: "AF00000-EXEMPLO",
    firstName: "Cliente",
    items: [
      { name: "Além da Fome", quantity: 1, totalCents: 6700, kind: "PRODUCT" },
      { name: "Material complementar (exemplo)", quantity: 1, totalCents: 1900, kind: "ORDER_BUMP" },
    ],
    subtotalCents: 8600,
    discountCents: 0,
    totalCents: 8600,
    paymentLabel: "PIX",
    pixCopyPaste: "EXEMPLO-DE-CODIGO-PIX-NAO-PAGAVEL",
    pixExpiresAt: new Date(Date.now() + 20 * 60_000),
    pixExpired: false,
    isUpsell: false,
    accessNote: null,
  };
}
