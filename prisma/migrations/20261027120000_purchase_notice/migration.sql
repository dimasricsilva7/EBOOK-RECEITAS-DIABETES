-- CreateTable
CREATE TABLE "PurchaseNotice" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "timeLabel" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseNotice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PurchaseNotice_active_sortOrder_idx" ON "PurchaseNotice"("active", "sortOrder");
