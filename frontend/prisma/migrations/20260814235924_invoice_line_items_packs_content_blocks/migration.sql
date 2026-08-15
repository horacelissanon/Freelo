-- AlterTable
-- trackingToken is added nullable + backfilled before the NOT NULL is
-- applied: the table already has existing rows (Prisma's @default(cuid())
-- is an application-level default for new INSERTs only, not a SQL DEFAULT,
-- so a plain `ADD COLUMN ... NOT NULL` would fail here).
ALTER TABLE "Invoice" ADD COLUMN     "deliveryDate" TIMESTAMP(3),
ADD COLUMN     "depositAmount" INTEGER,
ADD COLUMN     "footerNote" TEXT,
ADD COLUMN     "paymentMethodNote" TEXT,
ADD COLUMN     "paymentTermsNote" TEXT,
ADD COLUMN     "trackingToken" TEXT;

UPDATE "Invoice" SET "trackingToken" = gen_random_uuid()::text WHERE "trackingToken" IS NULL;

ALTER TABLE "Invoice" ALTER COLUMN "trackingToken" SET NOT NULL;

-- CreateTable
CREATE TABLE "InvoicePack" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoicePack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLineItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "packId" TEXT,
    "order" INTEGER NOT NULL,
    "designation" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteContentBlock" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "primaryText" TEXT NOT NULL,
    "secondaryText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteContentBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvoicePack_invoiceId_order_idx" ON "InvoicePack"("invoiceId", "order");

-- CreateIndex
CREATE INDEX "InvoiceLineItem_invoiceId_order_idx" ON "InvoiceLineItem"("invoiceId", "order");

-- CreateIndex
CREATE INDEX "InvoiceLineItem_packId_order_idx" ON "InvoiceLineItem"("packId", "order");

-- CreateIndex
CREATE INDEX "QuoteContentBlock_invoiceId_kind_order_idx" ON "QuoteContentBlock"("invoiceId", "kind", "order");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_trackingToken_key" ON "Invoice"("trackingToken");

-- AddForeignKey
ALTER TABLE "InvoicePack" ADD CONSTRAINT "InvoicePack_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLineItem" ADD CONSTRAINT "InvoiceLineItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLineItem" ADD CONSTRAINT "InvoiceLineItem_packId_fkey" FOREIGN KEY ("packId") REFERENCES "InvoicePack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteContentBlock" ADD CONSTRAINT "QuoteContentBlock_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

