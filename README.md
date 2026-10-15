# Diabetes à Mesa — Sabor Equilibrado

Operação de vendas completa do produto digital **Diabetes à Mesa** (marca **Sabor Equilibrado**): landing page premium com 3 ofertas, checkout PIX (BravoPay) com order bumps, **upsell** e **downsell** pós-compra, crediário opcional, entrega digital segura, e-mails transacionais, tracking (próprio + Meta Pixel/CAPI + GA4) e painel administrativo configurável.

Base técnica reaproveitada de **HAMA BEADS** / **ALÉM DA FOME** (admin, pedidos, PIX, webhook, crediário, cupons, testes A/B, relatórios, ROAS, mídia no banco, segurança anti-robô).

## Funil comercial
Três ofertas (planos), todas editáveis em **Admin → Produtos e materiais** e **Catálogo e ofertas**:

| Oferta | Preço | Inclui |
| --- | --- | --- |
| **Essencial** — E-book de Receitas | R$ 37,90 | E-book Diabetes à Mesa (100+ receitas) |
| **Prática** — Kit Receitas + Organização | R$ 47,90 | E-book + Planejamento Semanal + Guia de Rótulos |
| **Completa** — Kit Rotina Alimentar Completa | R$ 79,90 | E-book + Planejamento + Café da Manhã/Lanches + Sobremesas + Guia de Rótulos |

- **Order bumps** (checkout, máx. 3 ativos): Planejamento Semanal, Café da Manhã/Lanches, Sobremesas (ativos) + Guia de Rótulos (alternativa). Um bump é ocultado automaticamente se o item já estiver incluso na oferta escolhida (nunca cobra duas vezes).
- **Upsell** (1 ativo por vez): Organizador de Cardápio 30 Dias (demais cadastrados e inativos).
- **Downsell** (ao recusar o upsell): Organizador de Cardápio 7 Dias.

Preços, nomes, textos, imagens, materiais, compatibilidade e ativação são editáveis no admin sem novo deploy.

## Fluxo
Anúncio → **/** (redireciona para `/e-book` preservando UTMs) → **/e-book** (landing com as 3 ofertas) → **/checkout** (dados + bumps + PIX) → **/pedido/[número]?t=…** (PIX, upsell → downsell e área de acesso).

Regras de honestidade aplicadas no código:
- Conteúdo educativo de culinária: **não** promete curar diabetes nem controlar a glicemia; disclaimers na landing, nas políticas e nas ofertas.
- Material só aparece e só é vendido/entregue quando está **Pronto** (arquivo enviado ou link). Sem material pronto, o checkout recusa — as vendas começam **fechadas**.
- Preço calculado 100% no servidor; idempotência por `checkoutToken` e `WebhookEvent`. Cobrança BravoPay = total real do pedido.
- Acesso liberado **somente** após confirmação do gateway (webhook/consulta). Reembolso/contestação revoga o acesso.
- Purchase (Pixel + CAPI) só com pagamento confirmado, mesmo `event_id` (deduplicação). Upsell/downsell são pedidos separados com PIX próprio.
- Preços "de" são a soma real dos itens avulsos (referência honesta) — sem desconto inventado nem contagem regressiva falsa.

## Imagens
As imagens da landing e dos produtos em `public/img/` foram geradas por IA gratuita (Pollinations/flux) via `node scripts/gen-images.mjs`. São **placeholders de apresentação** — substitua pelos materiais reais (capa do e-book e fotos das receitas) em **Admin → Produtos / Galeria** antes de anunciar.

## Desenvolvimento local
```bash
npm install
cp .env.example .env              # DATABASE_URL, AUTH_SECRET, CRON_SECRET, BRAVOPAY_MODE=mock, EMAIL_PROVIDER=console…
npx prisma migrate deploy
npm run db:seed                   # catálogo, ofertas, bumps, upsells, downsell, landing (também roda no build da Vercel)
npm run admin:hash -- "senha-forte-12+"   # cole em ADMIN_PASSWORD_HASH (+ ADMIN_EMAIL)
npm run dev                       # http://localhost:3000 · admin em /admin
node scripts/gen-images.mjs       # (re)gera as imagens de apresentação
```

## Testes
```bash
npm run typecheck && npm run lint && npm test
npm run build:local
```
> Nunca rode E2E contra produção com a BravoPay real.

## Para abrir as vendas
1. Suba os PDFs/vídeos reais em **Admin → Produtos e materiais** e marque como **Pronto**.
2. Confira preços, textos e imagens das ofertas, bumps, upsell e downsell.
3. Ative as vendas em **Admin → Configurações** (`sales_enabled`).
4. Configure BravoPay real (`BRAVOPAY_API_KEY`, `BRAVOPAY_WEBHOOK_SECRET`), Resend (`RESEND_API_KEY`, `EMAIL_FROM`) e os pixels.
