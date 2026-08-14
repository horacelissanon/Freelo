-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "relatedInvoiceId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_relatedInvoiceId_key" ON "Invoice"("relatedInvoiceId");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_relatedInvoiceId_fkey" FOREIGN KEY ("relatedInvoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

