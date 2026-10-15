-- CreateEnum
CREATE TYPE "DownsellAction" AS ENUM ('VIEW', 'ACCEPT', 'REJECT');

-- CreateTable
CREATE TABLE "Downsell" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "upsellId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "priceCents" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Downsell_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DownsellEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "downsellId" TEXT NOT NULL,
    "action" "DownsellAction" NOT NULL,
    "childOrderId" TEXT,
    "priceCents" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DownsellEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Downsell_upsellId_key" ON "Downsell"("upsellId");

-- CreateIndex
CREATE INDEX "DownsellEvent_downsellId_createdAt_idx" ON "DownsellEvent"("downsellId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DownsellEvent_orderId_downsellId_action_key" ON "DownsellEvent"("orderId", "downsellId", "action");

-- AddForeignKey
ALTER TABLE "Downsell" ADD CONSTRAINT "Downsell_upsellId_fkey" FOREIGN KEY ("upsellId") REFERENCES "Upsell"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Downsell" ADD CONSTRAINT "Downsell_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DownsellEvent" ADD CONSTRAINT "DownsellEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DownsellEvent" ADD CONSTRAINT "DownsellEvent_downsellId_fkey" FOREIGN KEY ("downsellId") REFERENCES "Downsell"("id") ON DELETE CASCADE ON UPDATE CASCADE;
