/**
 * Templates de e-mail no visual do Além da Fome (off-white, terracota suave, sálvia, marrom profundo).
 * HTML de tabelas com estilos inline para Gmail/Outlook/Apple Mail. Assunto, título, texto e botão
 * de cada e-mail vêm de Admin → Configurações → E-mails ({nome} e {pedido} são substituídos).
 */

export type EmailBrand = {
  store: string;
  logoUrl: string | null;
  siteUrl: string;
  primary: string;
  sage: string;
  ink: string;
  background: string;
  whatsappUrl: string | null;
  contactEmail: string | null;
  companyLine: string | null;
};

export type EmailTexts = { subject: string; title: string; text: string; button: string };

export type EmailOrder = {
  orderNumber: string;
  firstName: string;
  items: { name: string; quantity: number; totalCents: number; kind: string }[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  paymentLabel: string;
  pixCopyPaste: string | null;
  pixExpiresAt: Date | null;
  /** PIX vencido/inexistente: o e-mail leva à página do pedido para gerar um código novo */
  pixExpired?: boolean;
  isUpsell: boolean;
  accessNote: string | null;
};

const brl = (c: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(c / 100).replace(/ /g, " ");
export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const SERIF = "Georgia,'Times New Roman',serif";
const SANS = "'Helvetica Neue',Arial,Helvetica,sans-serif";
const MUTED = "#6E5F57";
const LINE = "#EADFD6";

/** Substitui {nome} e {pedido} e escapa o resto. */
export function fill(t: string, vars: { nome?: string; pedido?: string }) {
  return esc(t).replace(/\{nome\}/g, esc(vars.nome ?? "")).replace(/\{pedido\}/g, esc(vars.pedido ?? ""));
}
const plain = (t: string, vars: { nome?: string; pedido?: string }) => t.replace(/\{nome\}/g, vars.nome ?? "").replace(/\{pedido\}/g, vars.pedido ?? "");

function button(b: EmailBrand, href: string, label: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:26px 0 6px"><tr><td align="center" bgcolor="${b.primary}" style="border-radius:999px">
<a href="${href}" target="_blank" style="display:block;padding:16px 26px;font-family:${SANS};font-size:15px;font-weight:700;letter-spacing:.3px;color:#ffffff;text-decoration:none;border-radius:999px">${esc(label)}</a></td></tr></table>`;
}

function itemsTable(o: EmailOrder) {
  const rows = o.items
    .map(
      (i) => `<tr><td style="padding:11px 0;border-bottom:1px solid ${LINE};font-family:${SANS};font-size:14px;color:#3B2A22">${esc(i.name)}${i.kind === "ORDER_BUMP" ? ` <span style="color:${MUTED};font-size:12px">(adicionado ao pedido)</span>` : ""}</td>
<td align="right" style="padding:11px 0;border-bottom:1px solid ${LINE};font-family:${SANS};font-size:14px;color:#3B2A22;white-space:nowrap">${brl(i.totalCents)}</td></tr>`
    )
    .join("");
  const line = (label: string, value: string, bold = false) =>
    `<tr><td style="padding:8px 0 0;font-family:${SANS};font-size:${bold ? 15 : 14}px;color:${bold ? "#3B2A22" : MUTED};font-weight:${bold ? 700 : 400}">${label}</td><td align="right" style="padding:8px 0 0;font-family:${bold ? SERIF : SANS};font-size:${bold ? 20 : 14}px;color:#3B2A22;font-weight:${bold ? 700 : 400};white-space:nowrap">${value}</td></tr>`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:12px">${rows}
${o.discountCents > 0 ? line("Subtotal", brl(o.subtotalCents)) + line("Desconto", `− ${brl(o.discountCents)}`) : ""}
${line("Total", brl(o.totalCents), true)}</table>`;
}

const box = (b: EmailBrand, html: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:18px"><tr><td style="background:${b.background};border-left:3px solid ${b.sage};border-radius:12px;padding:14px 16px;font-family:${SANS};font-size:14px;line-height:1.6;color:#3B2A22">${html}</td></tr></table>`;

function layout(b: EmailBrand, opts: { preheader: string; eyebrow: string; title: string; body: string; footerNote: string; unsubscribeUrl?: string }) {
  const contact = [
    b.whatsappUrl ? `<a href="${b.whatsappUrl}" style="color:${b.primary};text-decoration:none;font-weight:700">WhatsApp</a>` : "",
    b.contactEmail ? `<a href="mailto:${esc(b.contactEmail)}" style="color:${b.primary};text-decoration:none;font-weight:700">${esc(b.contactEmail)}</a>` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const head = b.logoUrl
    ? `<img src="${b.logoUrl}" alt="${esc(b.store)}" width="180" style="display:block;width:180px;max-width:180px;height:auto;border:0;outline:none">`
    : `<span style="font-family:${SERIF};font-size:24px;font-style:italic;color:${b.ink}">${esc(b.store)}</span>`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${esc(opts.title)}</title></head>
<body style="margin:0;padding:0;background:${b.background}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(opts.preheader)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${b.background}"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px">
<tr><td align="center" style="padding:4px 0 22px"><a href="${b.siteUrl}" target="_blank" style="text-decoration:none">${head}</a></td></tr>
<tr><td style="background:#ffffff;border:1px solid ${LINE};border-radius:20px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td style="padding:32px 28px 28px">
<p style="margin:0;font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:2.4px;text-transform:uppercase;color:${b.sage}">${esc(opts.eyebrow)}</p>
<h1 style="margin:10px 0 0;font-family:${SERIF};font-size:27px;line-height:1.2;font-weight:400;color:${b.ink}">${opts.title}</h1>
${opts.body}
</td></tr></table></td></tr>
<tr><td align="center" style="padding:22px 12px 0;font-family:${SANS};font-size:12px;line-height:1.7;color:${MUTED}">
${contact ? `Precisa de ajuda? ${contact}<br>` : ""}${esc(opts.footerNote)}<br>
<a href="${b.siteUrl}/politica-de-privacidade" style="color:${MUTED}">Privacidade</a> · <a href="${b.siteUrl}/termos" style="color:${MUTED}">Termos</a> · <a href="${b.siteUrl}/suporte" style="color:${MUTED}">Suporte</a>
${b.companyLine ? `<br>${esc(b.companyLine)}` : ""}${opts.unsubscribeUrl ? `<br><a href="${opts.unsubscribeUrl}" style="color:${MUTED}">Não quero receber lembretes de pagamento</a>` : ""}
</td></tr></table></td></tr></table></body></html>`;
}

const p = (html: string, style = "") => `<p style="margin:14px 0 0;font-family:${SANS};font-size:15px;line-height:1.65;color:#3B2A22;${style}">${html}</p>`;
const paragraphs = (t: string) => t.split(/\n\s*\n/).map((x) => p(x.replace(/\n/g, "<br>"))).join("");

function pixBlock(b: EmailBrand, o: EmailOrder) {
  if (!o.pixCopyPaste) return "";
  const expires = o.pixExpiresAt ? o.pixExpiresAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }) : null;
  return `<p style="margin:16px 0 6px;font-family:${SANS};font-size:13px;font-weight:700;color:#3B2A22">PIX copia e cola:</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td style="background:${b.background};border:1px dashed ${LINE};border-radius:12px;padding:12px;font-family:'Courier New',monospace;font-size:12px;line-height:1.45;color:#3B2A22;word-break:break-all">${esc(o.pixCopyPaste)}</td></tr></table>
${expires ? p(`O código vale até <b>${expires}</b>. A confirmação é automática — você não precisa enviar comprovante.`, `font-size:13px;color:${MUTED}`) : ""}`;
}

/** Pedido criado (PIX gerado): instruções de pagamento. Transacional. */
export function orderCreatedEmail(b: EmailBrand, o: EmailOrder, orderUrl: string, t: EmailTexts) {
  const vars = { nome: o.firstName, pedido: o.orderNumber };
  const body = `${paragraphs(fill(t.text, vars))}
${itemsTable(o)}
${pixBlock(b, o)}
${button(b, orderUrl, t.button)}`;
  const text = `${plain(t.title, vars)}\n\n${plain(t.text, vars)}\n\n${o.items.map((i) => `${i.name} — ${brl(i.totalCents)}`).join("\n")}\nTotal: ${brl(o.totalCents)}\n${o.pixCopyPaste ? `\nPIX copia e cola:\n${o.pixCopyPaste}\n` : ""}\nPedido: ${orderUrl}\n\n${b.store}`;
  return { subject: plain(t.subject, vars), html: layout(b, { preheader: `Pedido ${o.orderNumber} · ${brl(o.totalCents)} via PIX`, eyebrow: "Pedido recebido", title: fill(t.title, vars), body, footerNote: `Você recebeu este e-mail porque fez um pedido em ${b.store}.` }), text };
}

/** Pagamento confirmado + acesso (principal, order bump e upsell). Transacional. */
export function purchaseConfirmationEmail(b: EmailBrand, o: EmailOrder, accessUrl: string, t: EmailTexts) {
  const vars = { nome: o.firstName, pedido: o.orderNumber };
  const body = `${paragraphs(fill(t.text, vars))}
${box(b, `<b>Seu acesso está liberado.</b><br>Os materiais ficam na página do seu pedido — guarde este e-mail para voltar quando quiser.${o.accessNote ? `<br><span style="color:${MUTED}">${esc(o.accessNote)}</span>` : ""}`)}
${itemsTable(o)}
${button(b, accessUrl, t.button)}
${p(`Pagamento: ${esc(o.paymentLabel)} · Pedido ${esc(o.orderNumber)}`, `font-size:12px;color:${MUTED}`)}`;
  const text = `${plain(t.title, vars)}\n\n${plain(t.text, vars)}\n\nSeu acesso: ${accessUrl}\n\n${o.items.map((i) => `${i.name} — ${brl(i.totalCents)}`).join("\n")}\nTotal: ${brl(o.totalCents)}\n\n${b.store}`;
  return { subject: plain(t.subject, vars), html: layout(b, { preheader: "Pagamento confirmado — seu acesso aos materiais está liberado.", eyebrow: o.isUpsell ? "Material adicional liberado" : "Pagamento confirmado", title: fill(t.title, vars), body, footerNote: `Você recebeu este e-mail porque fez uma compra em ${b.store}.` }), text };
}

/** Reenvio do acesso (pela cliente em /acesso ou pelo admin). Transacional. */
export function accessResendEmail(b: EmailBrand, o: EmailOrder, accessUrl: string, t: EmailTexts) {
  const vars = { nome: o.firstName, pedido: o.orderNumber };
  const body = `${paragraphs(fill(t.text, vars))}
${itemsTable(o)}
${button(b, accessUrl, t.button)}
${p("Se você não pediu este e-mail, pode ignorá-lo com segurança.", `font-size:12px;color:${MUTED}`)}`;
  const text = `${plain(t.title, vars)}\n\n${plain(t.text, vars)}\n\nSeu acesso: ${accessUrl}\n\n${b.store}`;
  return { subject: plain(t.subject, vars), html: layout(b, { preheader: "Aqui está o link para acessar seus materiais.", eyebrow: "Seu acesso", title: fill(t.title, vars), body, footerNote: `Você recebeu este e-mail porque há uma compra no seu nome em ${b.store}.` }), text };
}

export function pixRecoveryEmail(b: EmailBrand, o: EmailOrder, orderUrl: string, t: EmailTexts, unsubscribeUrl?: string) {
  const vars = { nome: o.firstName, pedido: o.orderNumber };
  if (o.pixExpired) {
    const body = `${p(`Oi, ${esc(o.firstName)}. O código PIX do pedido <b>${esc(o.orderNumber)}</b> expirou antes do pagamento, mas o pedido continua salvo, com o mesmo valor.`)}
${itemsTable(o)}
${button(b, orderUrl, "Gerar novo PIX")}`;
    const text = `O PIX do pedido ${o.orderNumber} expirou, mas o pedido continua salvo. Gere um novo código: ${orderUrl}\n\n${b.store}`;
    return { subject: `Seu pedido ${o.orderNumber} continua salvo`, html: layout(b, { preheader: "Gere um novo PIX em 1 toque.", eyebrow: "Pedido salvo", title: "Seu pedido continua aqui", body, footerNote: `Você recebeu este e-mail porque iniciou um pedido em ${b.store}.`, unsubscribeUrl }), text };
  }
  const body = `${paragraphs(fill(t.text, vars))}
${itemsTable(o)}
${button(b, orderUrl, t.button)}
${pixBlock(b, o)}`;
  const text = `${plain(t.title, vars)}\n\n${plain(t.text, vars)}\n\nPagar: ${orderUrl}\n${o.pixCopyPaste ? `\nPIX copia e cola:\n${o.pixCopyPaste}\n` : ""}\n${b.store}`;
  return { subject: plain(t.subject, vars), html: layout(b, { preheader: "Seu pedido está aguardando o pagamento do PIX.", eyebrow: "Falta pouco", title: fill(t.title, vars), body, footerNote: `Você recebeu este e-mail porque iniciou um pedido em ${b.store}.`, unsubscribeUrl }), text };
}

export type EmailLead = { firstName: string | null; lines: string[]; totalCents: number };

/** Checkout abandonado (só se ativado no admin; desligado por padrão). */
export function checkoutRecoveryEmail(b: EmailBrand, l: EmailLead, checkoutUrl: string, t: EmailTexts, unsubscribeUrl?: string) {
  const vars = { nome: l.firstName ?? "" };
  const rows = l.lines.map((line) => `<tr><td style="padding:10px 0;border-bottom:1px solid ${LINE};font-family:${SANS};font-size:14px;color:#3B2A22">${esc(line)}</td></tr>`).join("");
  const body = `${paragraphs(fill(t.text, vars))}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:10px">${rows}
<tr><td style="padding:10px 0 0;font-family:${SERIF};font-size:20px;color:#3B2A22" align="right">${brl(l.totalCents)}</td></tr></table>
${button(b, checkoutUrl, t.button)}`;
  const text = `${plain(t.title, vars)}\n\n${plain(t.text, vars)}\n\n${l.lines.join("\n")}\nTotal: ${brl(l.totalCents)}\n\nContinuar: ${checkoutUrl}\n\n${b.store}`;
  return { subject: plain(t.subject, vars), html: layout(b, { preheader: "Seus dados ficaram salvos para você continuar quando quiser.", eyebrow: "Pedido não finalizado", title: fill(t.title, vars), body, footerNote: `Você recebeu este e-mail porque informou seu contato no checkout de ${b.store}.`, unsubscribeUrl }), text };
}

/** Resultado do quiz por escrito (a pessoa pediu ao informar o e-mail). Conteúdo educativo, não diagnóstico. */
export function quizResultEmail(b: EmailBrand, r: { firstName: string | null; title: string; body: string | null; points: string[]; disclaimer: string }, ctaUrl: string, ctaLabel: string) {
  const hi = r.firstName ? `Oi, ${esc(r.firstName)}.` : "Oi.";
  const body = `${p(`${hi} Como combinado, aqui está o resultado do quiz que você respondeu.`)}
${r.body ? paragraphs(esc(r.body)) : ""}
${r.points.length ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:12px">${r.points.map((x) => `<tr><td valign="top" style="padding:6px 10px 6px 0;color:${b.sage};font-family:${SANS};font-size:15px">—</td><td style="padding:6px 0;font-family:${SANS};font-size:14px;line-height:1.6;color:#3B2A22">${esc(x)}</td></tr>`).join("")}</table>` : ""}
${button(b, ctaUrl, ctaLabel)}
${p(esc(r.disclaimer), `font-size:12px;color:${MUTED}`)}`;
  const text = `${hi}\n\n${r.title}\n\n${r.body ?? ""}\n\n${r.points.map((x) => `- ${x}`).join("\n")}\n\n${ctaLabel}: ${ctaUrl}\n\n${r.disclaimer}\n\n${b.store}`;
  return { subject: `Seu resultado: ${r.title}`, html: layout(b, { preheader: "O resultado do quiz que você respondeu.", eyebrow: "Seu resultado", title: esc(r.title), body, footerNote: `Você recebeu este e-mail porque pediu o resultado do quiz em ${b.store}.` }), text };
}

/** Notificação interna de mensagem de suporte (para o e-mail de atendimento). */
export function supportNotificationEmail(b: EmailBrand, m: { name: string; email: string; orderNumber: string | null; subject: string; message: string }) {
  const body = `${p(`<b>De:</b> ${esc(m.name)} &lt;${esc(m.email)}&gt;${m.orderNumber ? `<br><b>Pedido:</b> ${esc(m.orderNumber)}` : ""}<br><b>Assunto:</b> ${esc(m.subject)}`)}
${box(b, esc(m.message).replace(/\n/g, "<br>"))}`;
  const text = `De: ${m.name} <${m.email}>\n${m.orderNumber ? `Pedido: ${m.orderNumber}\n` : ""}Assunto: ${m.subject}\n\n${m.message}`;
  return { subject: `[Suporte] ${m.subject}`, html: layout(b, { preheader: m.subject, eyebrow: "Nova mensagem de suporte", title: esc(m.subject), body, footerNote: "Responda direto a este e-mail para falar com a cliente." }), text };
}

/** Confirmação de recebimento para quem escreveu ao suporte. */
export function supportAckEmail(b: EmailBrand, m: { name: string; subject: string }) {
  const body = `${p(`Oi, ${esc(m.name.split(/\s+/)[0])}. Recebemos sua mensagem sobre <b>${esc(m.subject)}</b> e vamos responder por este e-mail o quanto antes.`)}`;
  const text = `Oi, ${m.name.split(/\s+/)[0]}. Recebemos sua mensagem sobre "${m.subject}" e vamos responder em breve.\n\n${b.store}`;
  return { subject: `Recebemos sua mensagem — ${b.store}`, html: layout(b, { preheader: "Sua mensagem chegou até nós.", eyebrow: "Suporte", title: "Recebemos sua mensagem", body, footerNote: `Você recebeu este e-mail porque escreveu para o suporte de ${b.store}.` }), text };
}
