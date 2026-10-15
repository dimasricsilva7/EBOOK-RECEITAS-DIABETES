import Link from "next/link";
import { Badge, Card, Field, PageHeader, inputCls, textareaCls } from "@/components/admin/ui";
import { ActionForm, SubmitButton } from "@/components/admin/client";
import { MediaInput } from "@/components/admin/inputs";
import { bravopayMode, envHealth, siteUrl } from "@/lib/env";
import { db } from "@/lib/db";
import { getSettingsFresh } from "@/server/settings";
import { saveSettings, saveTemplate, sendTestEmail } from "../sistema-actions";
import { emailProvider } from "@/lib/email/provider";

export const metadata = { title: "Configurações" };

const EMAIL_BLOCKS: { prefix: string; kind: string; title: string; toggle?: string; toggleLabel?: string; delay?: string; button?: false }[] = [
  { prefix: "email_order", kind: "order", title: "Pedido recebido (PIX gerado)", toggle: "email_order_enabled", toggleLabel: "Enviar ao gerar o PIX" },
  { prefix: "email_confirmation", kind: "confirmation", title: "Pagamento confirmado + acesso", toggle: "email_confirmation_enabled", toggleLabel: "Enviar ao confirmar o pagamento" },
  { prefix: "email_upsell", kind: "upsell", title: "Acesso de compra complementar (upsell)", button: false },
  { prefix: "email_recovery", kind: "recovery", title: "Lembrete de PIX pendente", toggle: "email_recovery_enabled", toggleLabel: "Enviar lembrete (cancelado se pagar antes)", delay: "email_recovery_delay_minutes" },
  { prefix: "email_access", kind: "access", title: "Reenvio de acesso" },
  { prefix: "email_checkout", kind: "checkout", title: "Checkout não finalizado (lembrete — desligado por padrão)", toggle: "email_checkout_enabled", toggleLabel: "Ativar (confirme a base legal antes)", delay: "email_checkout_delay_minutes" },
];
const EMAIL_KEYS = [
  "email_quiz_result_enabled",
  ...EMAIL_BLOCKS.flatMap((b) => [b.toggle, b.delay, `${b.prefix}_subject`, `${b.prefix}_title`, `${b.prefix}_text`, b.button === false ? undefined : `${b.prefix}_button`].filter(Boolean) as string[]),
];
type SP = Promise<{ aba?: string }>;

const TABS = { loja: "Marca e contato", vendas: "Vendas e garantia", autoria: "Autoria", aparencia: "Aparência e layout", checkout: "Checkout", privacidade: "Privacidade e quiz", rastreamento: "Pixels e analytics", seo: "SEO", politicas: "Políticas", emails: "E-mails", mensagens: "Mensagens (WhatsApp)", sistema: "Sistema" } as const;

export default async function SettingsPage({ searchParams }: { searchParams: SP }) {
  const tab = ((await searchParams).aba ?? "loja") as keyof typeof TABS;
  const s = await getSettingsFresh();
  const text = (key: string, label: string, hint?: string, placeholder?: string) => (
    <Field label={label} hint={hint}><input name={key} defaultValue={s[key]} placeholder={placeholder} className={inputCls} /></Field>
  );
  const check = (key: string, label: string) => (
    <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name={key} defaultChecked={s[key] === "true"} className="h-4 w-4" /> {label}</label>
  );
  const form = (keys: string[], children: React.ReactNode) => (
    <ActionForm action={saveSettings} className="space-y-4">
      <input type="hidden" name="__keys" value={keys.join(",")} />
      {children}
      <SubmitButton>Salvar</SubmitButton>
    </ActionForm>
  );

  return (
    <div>
      <PageHeader title="Configurações" />
      <nav className="mb-6 flex flex-wrap gap-1.5" aria-label="Abas">
        {Object.entries(TABS).map(([k, v]) => (
          <Link key={k} href={`?aba=${k}`} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${k === tab ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-700"}`}>{v}</Link>
        ))}
      </nav>

      {tab === "loja" && (
        <Card title="Dados da loja">
          {form(
            ["store_name", "store_tagline", "logo_url", "email_logo_url", "favicon_url", "company_name", "company_document", "contact_email", "support_email", "contact_phone", "whatsapp", "address", "support_hours", "instagram_url", "tiktok_url", "facebook_url", "youtube_url"],
            <div className="grid gap-4 md:grid-cols-2">
              {text("store_name", "Nome do produto/marca")}
              {text("store_tagline", "Frase curta")}
              <MediaInput name="logo_url" label="Logo (vazio = marca tipográfica)" defaultValue={s.logo_url} folder="brand" />
              <MediaInput name="favicon_url" label="Favicon" defaultValue={s.favicon_url} folder="brand" />
              <MediaInput name="email_logo_url" label="Logo para e-mail (PNG ou JPG por link https)" defaultValue={s.email_logo_url} folder="brand" />
              {text("company_name", "Responsável (razão social ou nome)", "Exibido no rodapé e no checkout — vazio = oculto")}
              {text("company_document", "CNPJ/CPF")}
              {text("contact_email", "E-mail de atendimento (público)")}
              {text("support_email", "E-mail que recebe as mensagens do suporte", "Vazio = usa o e-mail de atendimento")}
              {text("contact_phone", "Telefone")}
              {text("whatsapp", "WhatsApp (com DDD)", "Usado nos botões de atendimento", "11912345678")}
              {text("support_hours", "Horário de atendimento")}
              {text("address", "Endereço")}
              {text("instagram_url", "Instagram (URL)")}
              {text("tiktok_url", "TikTok (URL)")}
              {text("facebook_url", "Facebook (URL)")}
              {text("youtube_url", "YouTube (URL)")}
            </div>
          )}
        </Card>
      )}

      {tab === "vendas" && (
        <Card title="Vendas e garantia">
          {form(
            ["sales_enabled", "sales_closed_message", "guarantee_enabled", "guarantee_title", "guarantee_text"],
            <div className="space-y-4">
              {check("sales_enabled", "Vendas abertas (o checkout também exige pelo menos um material PRONTO em cada produto do pedido)")}
              <Field label="Mensagem quando as vendas estão fechadas"><input name="sales_closed_message" defaultValue={s.sales_closed_message} className={inputCls} /></Field>
              {check("guarantee_enabled", "Mostrar bloco de garantia/direito de arrependimento na oferta")}
              {text("guarantee_title", "Título da garantia")}
              <Field label="Texto da garantia" hint="Só prometa o que você cumpre. O direito de arrependimento de 7 dias (art. 49 do CDC) vale para compras online."><textarea name="guarantee_text" rows={4} defaultValue={s.guarantee_text} className={textareaCls} /></Field>
            </div>
          )}
        </Card>
      )}

      {tab === "autoria" && (
        <Card title="Autoria (seção de confiança da landing)">
          {form(
            ["author_name", "author_role", "author_bio", "author_photo_url"],
            <div className="grid gap-4 md:grid-cols-2">
              <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 md:col-span-2">Informe somente dados verdadeiros. Não cite formação, registro profissional ou credenciais que não possam ser comprovados. Com nome e bio vazios, o bloco não aparece.</p>
              {text("author_name", "Nome")}
              {text("author_role", "Como se apresenta", "Ex.: Criadora do Além da Fome")}
              <Field label="Bio" className="md:col-span-2"><textarea name="author_bio" rows={5} defaultValue={s.author_bio} className={textareaCls} /></Field>
              <div className="md:col-span-2"><MediaInput name="author_photo_url" label="Foto (real)" defaultValue={s.author_photo_url} folder="brand" /></div>
            </div>
          )}
        </Card>
      )}

      {tab === "privacidade" && (
        <Card title="Privacidade e quiz (LGPD)">
          {form(
            ["quiz_retention_days", "quiz_meta_events"],
            <div className="space-y-4">
              <Field label="Retenção das respostas do quiz (dias)" hint="Depois desse prazo (desde a última interação) as respostas são apagadas e leads sem compra são anonimizados. Padrão 180."><input name="quiz_retention_days" inputMode="numeric" defaultValue={s.quiz_retention_days} className={`${inputCls} max-w-[140px]`} /></Field>
              {check("quiz_meta_events", "Enviar à Meta os eventos QuizStarted, QuizStepCompleted, QuizCompleted e OfferViewed — SEM nenhum parâmetro (respostas e resultado nunca são enviados)")}
              <p className="text-xs text-slate-500">As respostas só são gravadas com o consentimento específico marcado no início do quiz. Leads e respostas ficam visíveis apenas para ADMIN/OWNER, e cada visualização é registrada na auditoria. A exclusão individual fica na página do lead.</p>
            </div>
          )}
        </Card>
      )}

      {tab === "aparencia" && (
        <Card title="Aparência (tokens do design system) e layout">
          {form(
            ["theme_primary", "theme_secondary", "theme_accent", "theme_ink", "theme_background", "announcement_text", "header_cta_label", "sticky_cta_enabled", "sticky_cta_label", "footer_text", "landing_animations"],
            <>
              <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
                {[["theme_primary", "Primária"], ["theme_secondary", "Secundária"], ["theme_accent", "Destaque"], ["theme_ink", "Texto"], ["theme_background", "Fundo"]].map(([k, l]) => (
                  <Field key={k} label={l}>
                    <span className="flex items-center gap-2">
                      <span className="h-10 w-10 shrink-0 rounded-lg border border-slate-300" style={{ background: s[k] }} />
                      <input name={k} defaultValue={s[k]} className={inputCls} />
                    </span>
                  </Field>
                ))}
              </div>
              <p className="text-xs text-slate-500">Mantenha bom contraste entre texto e fundo (WCAG AA). Botões usam a cor primária com texto branco.</p>
              <div className="grid gap-4 md:grid-cols-2">
                {text("announcement_text", "Barra de aviso (topo)", "Vazio = oculta. Não use urgência falsa.")}
                {text("header_cta_label", "Botão do header")}
                {text("sticky_cta_label", "CTA fixo no mobile")}
                {text("footer_text", "Texto do rodapé")}
              </div>
              {check("sticky_cta_enabled", "Mostrar CTA fixo no mobile")}
              {check("landing_animations", "Animações de entrada na página do e-book (quem pede menos movimento no aparelho nunca vê animações)")}
            </>
          )}
        </Card>
      )}

      {tab === "checkout" && (
        <Card title="Checkout e pagamento">
          {form(
            ["require_cpf", "checkout_title", "checkout_access_text", "checkout_security_text", "bump_section_title", "bump_section_text", "pix_expiration_minutes", "checkout_note", "checkout_reservation_minutes", "marketing_consent_label"],
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">{check("require_cpf", "Exigir CPF (exigido pela BravoPay para gerar o PIX)")}</div>
              {text("checkout_title", "Título do checkout")}
              {text("checkout_access_text", "Texto sobre a entrega do acesso")}
              {text("checkout_security_text", "Texto de segurança")}
              {text("pix_expiration_minutes", "Validade do PIX (minutos)")}
              {text("bump_section_title", "Título da área de order bump")}
              {text("bump_section_text", "Texto da área de order bump")}
              {text("checkout_reservation_minutes", "Barra de reserva (minutos)", "0 = desligada (recomendado: sem urgência artificial)")}
              {text("checkout_note", "Observação no pagamento")}
              <Field label="Texto do opt-in de marketing" className="md:col-span-2"><input name="marketing_consent_label" defaultValue={s.marketing_consent_label} className={inputCls} /></Field>
            </div>
          )}
          <p className="mt-4 text-xs text-slate-500">Produto 100% digital: não há frete nem endereço. Preços, bumps e upsells ficam em Produtos, Order bumps e Upsells.</p>
        </Card>
      )}

      {tab === "rastreamento" && (
        <Card title="Pixels e analytics">
          {form(
            ["meta_pixel_enabled", "meta_pixel_id", "meta_capi_enabled", "meta_domain_verification", "ga_enabled", "ga_id", "cookie_banner_enabled"],
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                {text("meta_pixel_id", "Meta Pixel ID(s)", "Um ou mais IDs separados por vírgula (até 3). Vazio = NEXT_PUBLIC_META_PIXEL_ID")}
                {text("ga_id", "Google Analytics 4 (G-XXXX)", "Vazio = usa NEXT_PUBLIC_GA_ID")}
                {text("meta_domain_verification", "Verificação de domínio da Meta", "Código da meta-tag facebook-domain-verification")}
              </div>
              {check("meta_pixel_enabled", "Meta Pixel ativo (PageView, ViewContent, AddToCart, InitiateCheckout, AddPaymentInfo, Purchase + eventos do quiz, se ativados em Privacidade)")}
              {check("meta_capi_enabled", `Conversions API ativa (tokens no servidor: META_CAPI_TOKENS por pixel ou META_ACCESS_TOKEN — ${process.env.META_CAPI_TOKENS || process.env.META_ACCESS_TOKEN ? "configurado" : "NÃO configurado"})`)}
              {check("ga_enabled", "GA4 ativo (page_view, view_item, add_to_cart, begin_checkout, add_payment_info, purchase)")}
              {check("cookie_banner_enabled", "Aviso de cookies com opção de recusar (modelo de recusa: Pixel/GA ativos até a pessoa recusar)")}
              <p className="text-xs text-slate-500">Scripts arbitrários não são aceitos por segurança (XSS). Purchase só é enviado após o pagamento confirmado pelo gateway, com o mesmo event_id no Pixel e na CAPI (deduplicação).</p>
            </div>
          )}
        </Card>
      )}

      {tab === "seo" && (
        <Card title="SEO e compartilhamento">
          {form(
            ["seo_title", "seo_description", "og_image_url"],
            <div className="space-y-4">
              <Field label="Título padrão (até 60)"><input name="seo_title" maxLength={70} defaultValue={s.seo_title} className={inputCls} /></Field>
              <Field label="Descrição (até 160)"><textarea name="seo_description" maxLength={170} rows={3} defaultValue={s.seo_description} className={textareaCls} /></Field>
              <MediaInput name="og_image_url" label="Imagem de compartilhamento (1200×630)" defaultValue={s.og_image_url} folder="marca" />
              <p className="text-xs text-slate-500">Sem imagem, usamos uma gerada automaticamente ({siteUrl()}/og). Sitemap: {siteUrl()}/sitemap.xml</p>
            </div>
          )}
        </Card>
      )}

      {tab === "politicas" && (
        <Card title="Políticas (texto editável)">
          {form(
            ["policy_privacy", "policy_terms", "policy_returns", "policy_cookies"],
            <div className="space-y-4">
              <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Os textos iniciais são modelos genéricos marcados com [PREENCHER]. Revise com seu jurídico e inclua os dados reais da empresa.</p>
              {[["policy_privacy", "Política de Privacidade"], ["policy_terms", "Termos de Uso"], ["policy_returns", "Reembolso"], ["policy_cookies", "Cookies"]].map(([k, l]) => (
                <Field key={k} label={l}><textarea name={k} rows={10} defaultValue={s[k]} className={`${textareaCls} font-mono text-xs`} /></Field>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === "emails" && (
        <div className="space-y-6">
          <Card title="E-mails transacionais (Resend)">
            <p className="mb-4 text-sm">
              Status:{" "}
              {emailProvider() === "resend" ? <Badge tone="green">ativo — enviando por {process.env.EMAIL_FROM}</Badge> : <Badge tone="red">desativado — defina RESEND_API_KEY e EMAIL_FROM na Vercel</Badge>}
            </p>
            {form(
              EMAIL_KEYS,
              <div className="space-y-6">
                <p className="text-xs text-slate-500">Use {"{nome}"} e {"{pedido}"} nos textos. Comunicações promocionais não são enviadas automaticamente.</p>
                {EMAIL_BLOCKS.map((b) => (
                  <fieldset key={b.prefix} className="rounded-xl border border-slate-200 p-4">
                    <legend className="px-1 text-sm font-semibold">{b.title}</legend>
                    {b.toggle && check(b.toggle, b.toggleLabel ?? "Ativo")}
                    {b.delay && <div className="mt-2">{text(b.delay, "Enviar após (minutos)")}</div>}
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {text(`${b.prefix}_subject`, "Assunto")}
                      {text(`${b.prefix}_title`, "Título")}
                      <Field label="Texto" className="md:col-span-2"><textarea name={`${b.prefix}_text`} rows={3} defaultValue={s[`${b.prefix}_text`]} className={textareaCls} /></Field>
                      {b.button !== false && text(`${b.prefix}_button`, "Botão")}
                    </div>
                    <a className="mt-2 inline-block text-xs font-semibold underline" target="_blank" href={`/api/admin/email-preview?kind=${b.kind}`}>Ver prévia</a>
                  </fieldset>
                ))}
              </div>
            )}
          </Card>
          <Card title="Enviar teste">
            <ActionForm action={sendTestEmail} className="flex flex-wrap items-center gap-2">
              <select name="type" className={`${inputCls} w-auto`} aria-label="Template">
                {EMAIL_BLOCKS.map((b) => <option key={b.kind} value={b.kind}>{b.title}</option>)}
              </select>
              <SubmitButton pendingText="Enviando…">Enviar teste para o meu e-mail</SubmitButton>
            </ActionForm>
          </Card>
        </div>
      )}
      {tab === "mensagens" && <TemplatesTab />}
      {tab === "sistema" && <SystemTab />}
    </div>
  );
}

async function TemplatesTab() {
  const templates = await db.messageTemplate.findMany({ orderBy: { createdAt: "asc" } });
  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">Modelos para recuperação manual de PIX pendentes. Variáveis: {"{primeiro_nome} {loja} {pedido} {valor} {link}"}. Nada é enviado automaticamente.</p>
      {[...templates, null].map((t, i) => (
        <Card key={t?.id ?? `new-${i}`} title={t ? `${t.channel} · ${t.name}` : "Novo modelo"}>
          <ActionForm action={saveTemplate} resetOnSuccess={!t}>
            {t && <input type="hidden" name="id" value={t.id} />}
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Canal"><select name="channel" defaultValue={t?.channel ?? "WHATSAPP"} className={inputCls}><option>WHATSAPP</option><option>EMAIL</option></select></Field>
              <Field label="Nome"><input name="name" defaultValue={t?.name ?? ""} className={inputCls} /></Field>
            </div>
            <Field label="Mensagem"><textarea name="body" rows={4} defaultValue={t?.body ?? ""} className={textareaCls} /></Field>
            <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="active" defaultChecked={t?.active ?? true} className="h-4 w-4" /> Ativo</label>
            <SubmitButton>Salvar modelo</SubmitButton>
          </ActionForm>
        </Card>
      ))}
    </div>
  );
}

function SystemTab() {
  const env = envHealth();
  const mode = bravopayMode();
  return (
    <div className="space-y-6">
      <Card title="Gateway de pagamento">
        <p className="text-sm">
          BravoPay: {mode === "live" ? <Badge tone="green">produção (API real)</Badge> : mode === "mock" ? <Badge tone="amber">modo de teste (PIX fictício)</Badge> : <Badge tone="red">desativado — checkout indisponível</Badge>}
        </p>
        <p className="mt-2 text-sm text-slate-600">Webhook a configurar no painel BravoPay: <code className="rounded bg-slate-100 px-1.5 py-0.5">{siteUrl()}/api/webhooks/bravopay</code></p>
        <p className="mt-1 text-xs text-slate-500">Eventos: transaction.created, paid, refunded, chargeback, expired, failed, receipt_uploaded. Assinatura HMAC-SHA256 obrigatória.</p>
      </Card>
      <Card title="Variáveis de ambiente (somente presença — valores nunca são exibidos)">
        <ul className="divide-y divide-slate-100 text-sm">
          {env.map((e) => (
            <li key={e.key} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span><code className="font-mono text-xs">{e.key}</code> <span className="text-slate-500">— {e.hint}</span></span>
              {e.ok ? <Badge tone="green">ok</Badge> : e.required ? <Badge tone="red">ausente</Badge> : <Badge>opcional</Badge>}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
