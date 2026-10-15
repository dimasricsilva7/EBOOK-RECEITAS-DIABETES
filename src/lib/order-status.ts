import { isPaidStatus, type OrderStatusKey } from "./domain";

/**
 * Transições permitidas por eventos de PAGAMENTO (webhook, polling, reconciliação).
 * Um pedido pago nunca volta a pendente/expirado; pagamento tardio de PIX expirado é aceito.
 */
export function canTransition(from: OrderStatusKey, to: OrderStatusKey): boolean {
  if (from === to) return false;
  const awaiting = from === "PENDING" || from === "PIX_GENERATED";
  if (to === "PAID") return awaiting || from === "EXPIRED" || from === "FAILED" || from === "CANCELLED";
  if (to === "EXPIRED" || to === "FAILED") return awaiting;
  if (to === "REFUNDED") return isPaidStatus(from);
  if (to === "CHARGEBACK") return isPaidStatus(from) || from === "REFUNDED";
  return false;
}
