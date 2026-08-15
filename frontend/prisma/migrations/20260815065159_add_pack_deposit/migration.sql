-- Per-offer acompte (deposit) on InvoicePack: a fixed amount or a percent
-- rate, independent per pack since each offer is its own proposal.
ALTER TABLE "InvoicePack" ADD COLUMN "depositType" TEXT;
ALTER TABLE "InvoicePack" ADD COLUMN "depositValue" INTEGER;
