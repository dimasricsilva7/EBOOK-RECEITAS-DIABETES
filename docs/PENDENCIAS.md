# Pendências do dono — Diabetes à Mesa (Sabor Equilibrado)

O site já está no ar com o funil completo (3 ofertas, order bumps, upsell e downsell), mas as **vendas começam fechadas** até você concluir os itens abaixo. Isso é proposital: o sistema nunca vende um material que ainda não existe.

| # | O quê | Onde | Urgência |
|---|---|---|---|
| 1 | **Subir os materiais reais** (PDF do e-book e dos kits/guia; vídeo do minicurso) e marcar como **Pronto**. Enquanto estiverem "Pendentes", o checkout recusa a venda. | Admin → Produtos e materiais | 🔴 abrir vendas |
| 2 | **Trocar as imagens de apresentação** (geradas por IA) pela capa real do e-book e por fotos reais das receitas. | Admin → Produtos / Galeria | 🔴 |
| 3 | **Ativar as vendas** depois de 1 e 2. | Admin → Configurações (`sales_enabled`) | 🔴 |
| 4 | **Banco permanente.** O banco atual é um Neon temporário (claimable, expira em poucos dias). Criar um Neon permanente pela Vercel (Storage) e trocar `DATABASE_URL` / `DATABASE_URL_UNPOOLED`. | Vercel → projeto → Storage | 🔴 antes de tráfego real |
| 5 | **BravoPay real.** Cadastrar `BRAVOPAY_API_KEY` e o webhook `/api/webhooks/bravopay` com `BRAVOPAY_WEBHOOK_SECRET`. Sem isso o PIX não é gerado em produção. | Vercel → Environment Variables + painel BravoPay | 🔴 |
| 6 | **E-mails (Resend).** `RESEND_API_KEY` + `EMAIL_FROM` com domínio verificado (SPF/DKIM). Trocar `EMAIL_PROVIDER=console`. | Vercel → Environment Variables + Resend | 🟠 |
| 7 | **Pixels / CAPI / GA4.** Preencher `meta_pixel_id`, `META_CAPI_TOKENS`, `ga_id` para medir os anúncios. | Admin → Configurações (Rastreamento) | 🟠 |
| 8 | **Trocar a senha do admin.** A senha de bootstrap é provisória. Gere outra: `npm run admin:hash -- "nova-senha"` e atualize `ADMIN_PASSWORD_HASH`. | Vercel → Environment Variables | 🟠 |
| 9 | **Dados da empresa + políticas.** Preencher CNPJ/razão social, e-mail de contato e revisar os textos [PREENCHER] de Privacidade/Termos/Reembolso com apoio jurídico. | Admin → Configurações | 🟠 |
| 10 | **Domínio próprio** (opcional) e `NEXT_PUBLIC_SITE_URL`. | Vercel → Domains | 🟢 |

## Regras de conformidade já aplicadas no código
- **Nada de promessa de cura/controle da glicemia.** O produto é conteúdo educativo de culinária; os disclaimers estão na landing, nas ofertas e nas políticas.
- Preço calculado no servidor; cobrança BravoPay = total real (com bumps). Idempotência contra cobranças duplicadas.
- Acesso liberado só após confirmação do pagamento; reembolso/contestação revoga o acesso.
- Order bumps: no máximo 3 ativos; um bump some se o item já estiver incluso na oferta (nunca cobra duas vezes).
- Upsell: só 1 ativo por vez. Downsell aparece só quando o upsell é recusado.
- Sem urgência falsa, caixas pré-marcadas, depoimentos ou descontos inventados. Os preços "de" são a soma real dos itens avulsos.

## Como editar o funil (sem novo deploy)
Admin → **Catálogo e ofertas**: Produtos e materiais, Order bumps, Upsells, Downsells. Admin → **Conteúdo (CMS)**: Landing page, Galeria, FAQ. Admin → **Relatórios → Bumps, upsells e downsells** para as métricas.
