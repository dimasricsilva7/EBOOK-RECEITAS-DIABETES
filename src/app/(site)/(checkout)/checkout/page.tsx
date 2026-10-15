import type { Metadata } from "next";
import { CheckoutClient } from "./CheckoutClient";
import { getSettingsFresh, isOn } from "@/server/settings";
import { crediarioConfig } from "@/lib/crediario";
import { bravopayMode } from "@/lib/env";

export const metadata: Metadata = { title: "Finalizar compra", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const s = await getSettingsFresh();
  return (
    <CheckoutClient
      title={s.checkout_title || "Finalizar compra"}
      requireCpf={isOn(s.require_cpf)}
      checkoutNote={s.checkout_note || null}
      accessText={s.checkout_access_text || "O acesso é enviado para o seu e-mail assim que o pagamento é confirmado."}
      securityText={s.checkout_security_text || ""}
      bumpTitle={s.bump_section_title || "Quer complementar?"}
      bumpText={s.bump_section_text || ""}
      consentLabel={s.marketing_consent_label}
      pix={{
        enabled: isOn(s.pix_enabled) && bravopayMode() !== "disabled",
        label: s.pix_method_label || "PIX",
        badge: s.pix_badge ?? "",
        description: s.pix_description ?? "",
        button: s.pix_button_label || "Gerar PIX",
      }}
      crediario={crediarioConfig(s)}
      cnpj={s.company_document || null}
      companyName={s.company_name || null}
      reservationMinutes={Number.parseInt(s.checkout_reservation_minutes || "0", 10) || 0}
      salesClosed={isOn(s.sales_enabled) ? null : s.sales_closed_message || "As vendas ainda não estão abertas."}
    />
  );
}
