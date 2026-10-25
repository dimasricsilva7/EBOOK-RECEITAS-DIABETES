/**
 * Valores padrão das configurações. Tudo é editável em Admin → Configurações (sem deploy).
 * Campos vazios que dependem de dados reais (empresa, autoria, contatos) NÃO aparecem no site até
 * serem preenchidos. Textos marcados com [PREENCHER] precisam de revisão antes de publicar.
 */
export const SETTING_DEFAULTS: Record<string, string> = {
  // Marca
  store_name: "Sabor Equilibrado",
  store_tagline: "Receitas práticas e variadas para quem convive com diabetes",
  logo_url: "",
  email_logo_url: "",
  favicon_url: "",
  // Empresa e contato (vazio = não exibido)
  company_name: "",
  company_document: "",
  contact_email: "",
  support_email: "",
  contact_phone: "",
  whatsapp: "",
  address: "",
  support_hours: "",
  instagram_url: "",
  tiktok_url: "",
  facebook_url: "",
  youtube_url: "",
  // Autoria (só aparece na landing se preenchida — nunca inventar credenciais)
  author_name: "",
  author_role: "",
  author_bio: "",
  author_photo_url: "",
  // Aparência (tema fresco: verde natural + âmbar quente)
  theme_primary: "#1F8A5B",
  theme_secondary: "#0E6B4A",
  theme_accent: "#F4A935",
  theme_ink: "#20302A",
  theme_background: "#F6FAF4",
  // Layout
  announcement_text: "",
  header_cta_label: "Quero as receitas",
  sticky_cta_enabled: "true",
  landing_animations: "true",
  sticky_cta_label: "Quero o Diabetes à Mesa",
  footer_text: "Conteúdo educativo de culinária. Não substitui acompanhamento médico ou nutricional e não trata nem cura diabetes.",
  // Vendas — desligadas até haver material real pronto (o checkout também exige material READY)
  sales_enabled: "false",
  sales_closed_message: "As vendas do Diabetes à Mesa ainda não estão abertas. Volte em breve!",
  // Garantia (direito de arrependimento é previsto em lei para compras online)
  guarantee_enabled: "true",
  guarantee_title: "7 dias para decidir com calma",
  guarantee_text:
    "Você pode desistir da compra em até 7 dias após o pagamento e receber o valor de volta, conforme o direito de arrependimento do art. 49 do Código de Defesa do Consumidor. Basta escrever para o suporte informando o número do pedido.",
  // Checkout
  require_cpf: "true",
  checkout_title: "Finalizar compra",
  checkout_note: "",
  checkout_security_text: "Seus dados são usados apenas para processar o pagamento e entregar o seu acesso.",
  checkout_access_text: "O acesso é enviado para o seu e-mail assim que o pagamento é confirmado.",
  checkout_reservation_minutes: "0",
  bump_section_title: "Quer complementar?",
  bump_section_text: "Opcional — marque somente se fizer sentido para você.",
  pix_expiration_minutes: "30",
  // PIX
  pix_enabled: "true",
  pix_method_label: "PIX",
  pix_badge: "",
  pix_description: "Confirmação automática. O QR Code e o código copia e cola aparecem na próxima tela.",
  pix_button_label: "Gerar PIX",
  // Crediário (protocolo próprio, NÃO é cartão). Desativado até configurar.
  crediario_enabled: "false",
  crediario_method_label: "Crediário",
  crediario_method_subtitle: "Em até {parcelas}x · com o protocolo do seu crediário",
  crediario_section_title: "Pagamento pelo crediário",
  crediario_description: "Use o protocolo do seu crediário. Seu pedido fica registrado e é confirmado após a análise.",
  crediario_protocol_label: "Número do protocolo",
  crediario_protocol_placeholder: "Digite os 16 dígitos do seu protocolo",
  crediario_protocol_digits: "16",
  crediario_protocol_help: "",
  crediario_protocol_error: "Informe os {n} dígitos do protocolo (somente números).",
  crediario_validity_label: "Validade do protocolo",
  crediario_validity_placeholder: "MM/AA",
  crediario_validity_format: "MM/AA",
  crediario_validity_error: "Informe a validade no formato {formato}.",
  crediario_validity_expired_error: "Este protocolo está vencido. Confira a validade.",
  crediario_validity_reject_expired: "true",
  crediario_cpf_label: "3 últimos dígitos do CPF",
  crediario_cpf_placeholder: "Digite os 3 últimos dígitos",
  crediario_cpf_digits: "3",
  crediario_cpf_error: "Informe os {n} últimos dígitos do CPF.",
  crediario_installments_label: "Parcelamento",
  crediario_installments_description: "",
  crediario_max_installments: "2",
  crediario_installment_text: "{n}x de {valor}",
  crediario_help_text: "",
  crediario_error_message: "Não foi possível registrar seu pedido no crediário. Confira os dados e tente novamente.",
  crediario_success_title: "Pedido recebido!",
  crediario_success_message: "Seu pedido foi registrado no crediário e está aguardando análise. Avisaremos você pelo e-mail informado.",
  crediario_info_message: "Nenhum valor é cobrado agora. O acesso é liberado após a aprovação.",
  crediario_button_label: "Confirmar pedido no crediário",
  crediario_security_text: "Seus dados são usados apenas para a análise do crediário e ficam protegidos.",
  marketing_consent_label: "Quero receber receitas e novidades do Sabor Equilibrado por e-mail (opcional).",
  // E-mails transacionais (Resend). {nome} e {pedido} são substituídos.
  email_order_enabled: "true",
  email_order_subject: "Recebemos seu pedido {pedido}",
  email_order_title: "Seu pedido está quase pronto, {nome}",
  email_order_text: "Recebemos o seu pedido. Assim que o PIX for pago, a confirmação chega automaticamente e enviamos o seu acesso por e-mail.",
  email_order_button: "Ver meu pedido",
  email_confirmation_enabled: "true",
  email_confirmation_subject: "Seu acesso ao Diabetes à Mesa está liberado",
  email_confirmation_title: "Que bom ter você aqui, {nome}",
  email_confirmation_text: "Recebemos o seu pagamento e o seu acesso já está disponível. Bom apetite e boas receitas!",
  email_confirmation_button: "Acessar meus materiais",
  email_upsell_subject: "Seu material adicional está liberado",
  email_upsell_title: "Pronto, {nome}: material adicional liberado",
  email_upsell_text: "Recebemos o pagamento do pedido {pedido}. O novo material já está disponível no link abaixo.",
  email_recovery_enabled: "true",
  email_recovery_delay_minutes: "15",
  email_recovery_subject: "{nome}, seu pedido está aguardando o PIX",
  email_recovery_title: "Seu pedido continua reservado",
  email_recovery_text: "O PIX do pedido {pedido} ainda não foi pago. Se quiser concluir, é só usar o código abaixo — a confirmação é automática.",
  email_recovery_button: "Pagar com PIX",
  email_access_subject: "Seu link de acesso — pedido {pedido}",
  email_access_title: "Aqui está o seu acesso, {nome}",
  email_access_text: "Você pediu o link para acessar os seus materiais. É só tocar no botão abaixo.",
  email_access_button: "Acessar meus materiais",
  email_quiz_result_enabled: "true",
  // Checkout abandonado: lembrete DESLIGADO por padrão (verifique a base legal antes de ativar)
  email_checkout_enabled: "false",
  email_checkout_delay_minutes: "60",
  email_checkout_subject: "{nome}, seu pedido ficou salvo",
  email_checkout_title: "Você pode continuar quando quiser",
  email_checkout_text: "Você começou a finalizar o pedido, mas não chegou a gerar o PIX. Guardamos seus dados para facilitar, sem pressa.",
  email_checkout_button: "Continuar meu pedido",
  // Prova social / avaliações (TODOS os números devem ser REAIS — não invente)
  reviews_enabled: "true",
  reviews_section_title: "Avaliações de clientes",
  // Nota média e total exibidos. Vazio = calcula pela média real e pelo nº de avaliações cadastradas.
  reviews_rating: "",
  reviews_count: "",
  reviews_count_label: "avaliações verificadas",
  reviews_verified_label: "Compra verificada",
  // Linha de prova no topo do hero (ex.: "Mais de 2.000 leitores"). Vazio = não exibe.
  reviews_hero_proof: "",
  // Quiz e privacidade
  quiz_retention_days: "180",
  quiz_meta_events: "true",
  // Rastreamento
  meta_pixel_enabled: "true",
  meta_pixel_id: "",
  meta_capi_enabled: "true",
  meta_domain_verification: "",
  ga_enabled: "true",
  ga_id: "",
  cookie_banner_enabled: "true",
  // SEO
  seo_title: "Diabetes à Mesa — receitas práticas e variadas para o dia a dia",
  seo_description:
    "E-book digital com receitas práticas, variadas e organizadas para quem convive com diabetes. Conteúdo educativo de culinária — não substitui acompanhamento médico ou nutricional.",
  og_image_url: "",
  // Políticas (modelos — revise com seu jurídico e preencha os dados reais)
  policy_privacy: `[PREENCHER] Política de Privacidade

Este texto é um modelo inicial e precisa ser revisado e completado com os dados reais do responsável pelo produto.

1. Quais dados coletamos
• Compra: nome, e-mail, telefone e CPF (exigido pelo processador de pagamentos para o PIX).
• Navegação: páginas visitadas, origem da visita e dispositivo, de forma pseudonimizada.

2. Para que usamos
Processar o pagamento, entregar o acesso aos materiais digitais, prestar suporte e, somente com o seu consentimento, enviar receitas e novidades.

3. O que NÃO fazemos
Não vendemos seus dados e não coletamos informações sensíveis de saúde para anúncios.

4. Compartilhamento
Com o processador de pagamentos (PIX), com o serviço de envio de e-mails e, se você não recusar os cookies de marketing, com plataformas de anúncios — apenas dados de navegação e compra.

5. Por quanto tempo guardamos
Dados de compra: pelo prazo exigido pela legislação fiscal e de consumo.

6. Seus direitos (LGPD)
Você pode pedir acesso, correção, portabilidade ou exclusão dos seus dados e revogar consentimentos pelo e-mail de suporte.

7. Controlador
[PREENCHER razão social/nome, CNPJ/CPF e e-mail de contato].`,
  policy_terms: `[PREENCHER] Termos de Uso

Este texto é um modelo inicial e precisa ser revisado com os dados reais do responsável pelo produto.

O Diabetes à Mesa é um produto digital educativo de culinária, com receitas práticas e variadas. Ele é informativo, não é tratamento, não promete resultados individuais e não substitui acompanhamento médico ou nutricional. Não trata nem cura diabetes e não garante controle da glicemia. Consulte sempre o seu médico ou nutricionista antes de mudar sua alimentação.

O acesso é pessoal e intransferível. Os materiais não podem ser revendidos, copiados ou redistribuídos. Preços e conteúdos podem mudar sem afetar compras já realizadas.`,
  policy_returns: `[PREENCHER] Política de Reembolso

Você pode desistir da compra em até 7 dias corridos após o pagamento (art. 49 do Código de Defesa do Consumidor) e receber o valor integral de volta. Para solicitar, escreva para o suporte informando o número do pedido. Após o reembolso, o acesso aos materiais é encerrado.

[PREENCHER prazo de devolução do valor e canal de atendimento].`,
  policy_cookies: `Política de Cookies

Usamos cookies essenciais (sessão e segurança neste navegador) e cookies de medição e marketing (Meta Pixel e Google) para medir nossos anúncios. Os de medição e marketing ficam ativos por padrão e você pode recusá-los a qualquer momento no aviso de cookies ou em "Preferências de cookies", no rodapé.`,
};

export const POLICY_PAGES = {
  "politica-de-privacidade": { key: "policy_privacy", title: "Política de Privacidade" },
  termos: { key: "policy_terms", title: "Termos de Uso" },
  "trocas-e-devolucoes": { key: "policy_returns", title: "Política de Reembolso" },
  cookies: { key: "policy_cookies", title: "Política de Cookies" },
} as const;
