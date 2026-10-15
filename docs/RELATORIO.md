# Diabetes à Mesa — visão técnica

Resumo da arquitetura e das decisões. Para instruções de uso e abertura de vendas, veja o [README](../README.md); para as ações manuais do dono, [PENDENCIAS.md](PENDENCIAS.md).

## Stack
Next.js 15 (App Router) + Prisma + PostgreSQL (Neon) + Tailwind. Pagamento PIX via BravoPay. Mídia e materiais digitais guardados no próprio banco (independe do Vercel Blob). Base reaproveitada de HAMA BEADS / ALÉM DA FOME.

## Modelagem do funil
- **Produtos de conteúdo** (e-book + kits + guia + materiais de upsell/downsell): cada um com um `DigitalMaterial` real (começa `PENDING`).
- **Ofertas** (`Product` categoria `PROGRAM`): 3 kits que incluem produtos via `includedProductIds`. A landing mostra os 3 planos.
- **Order bumps** (`OrderBump`): no checkout; o `cart` esconde um bump cujo produto já está incluso na oferta (sem cobrança dupla). Máx. 3 ativos (validado no servidor e no admin).
- **Upsell** (`Upsell`) e **Downsell** (`Downsell`, 1:1 com o upsell): pós-compra, cada aceite gera um pedido complementar com PIX próprio. Só 1 upsell ativo por vez.
- **Entitlements**: `OrderItem` → `DigitalAccess` liberado em `onPaid`; a entrega inclui os materiais dos produtos inclusos.

## Preço e pagamento
Preço calculado 100% no servidor (`server/cart.ts` + `lib/pricing.ts`); o navegador nunca define valor. Idempotência por `checkoutToken` (pedido) e `WebhookEvent.eventId` (webhook). A cobrança BravoPay usa o total real do pedido (com bumps).

## Analytics
Eventos próprios + Meta Pixel/CAPI + GA4. Registrados: visualização de plano/oferta, início de checkout, seleção/remoção de bump, geração de PIX, confirmação, upsell/downsell view/accept/reject, entrega. `Purchase` só dispara após pagamento confirmado, com `event_id` deduplicado. Relatórios em Admin → Relatórios.

## Imagens
`public/img/` — geradas por IA gratuita (Pollinations/flux) via `scripts/gen-images.mjs`. São placeholders de apresentação; substituir pelos materiais reais no admin.

## Migrations
`prisma/migrations` — inclui `add_downsell` (tabelas `Downsell`/`DownsellEvent`). O build roda `prisma migrate deploy && tsx prisma/seed.ts && next build`. O seed é idempotente (create-only): não sobrescreve edições feitas no admin.
