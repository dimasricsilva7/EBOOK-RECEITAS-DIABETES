import type { Metadata } from "next";
import Link from "next/link";
import QRCode from "qrcode";
import { OrderClient } from "./OrderClient";
import { findOrderByAccess, getNextUpsell, recordAccessView, toPublicOrder } from "@/server/orders";
import { getSettings } from "@/server/settings";
import { crediarioConfig } from "@/lib/crediario";
import { whatsappLink } from "@/components/layout/Footer";

export const metadata: Metadata = { title: "Seu pedido", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ numero: string }>; searchParams: Promise<{ t?: string }> };

/** Página do pedido = pagamento (PIX/crediário) + área de acesso aos materiais após a confirmação. */
export default async function OrderPage({ params, searchParams }: Props) {
  const [{ numero }, { t }] = await Promise.all([params, searchParams]);
  const order = await findOrderByAccess(decodeURIComponent(numero), t);
  if (!order) {
    return (
      <div className="container-page max-w-lg py-24 text-center">
        <h1 className="h-section">Pedido não encontrado</h1>
        <p className="lead mt-4">Confira o link recebido por e-mail ou peça um novo link de acesso.</p>
        <Link href="/acesso" className="btn-primary mt-8">Recuperar meu acesso</Link>
      </div>
    );
  }
  const [pub, upsell, s] = await Promise.all([Promise.resolve(toPublicOrder(order)), getNextUpsell(order), getSettings(), recordAccessView(order)]);
  const qrSvg = pub.pixCopyPaste ? await QRCode.toString(pub.pixCopyPaste, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#3B2A22", light: "#FFFFFF" } }) : null;
  const wa = s.whatsapp ? whatsappLink(s.whatsapp, `Olá! Tenho uma dúvida sobre o pedido ${pub.orderNumber}.`) : null;
  const cfg = crediarioConfig(s);

  return <OrderClient initial={pub} token={t!} qrSvg={qrSvg} upsell={upsell} whatsappUrl={wa} crediarioTexts={{ successTitle: cfg.successTitle, successMessage: cfg.successMessage, infoMessage: cfg.infoMessage }} />;
}
