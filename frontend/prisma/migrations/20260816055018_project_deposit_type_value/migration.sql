-- Replace Project.depositPercent (always a % rate) with depositType +
-- depositValue, mirroring InvoicePack's depositType/depositValue pattern:
-- NONE = no deposit expected, FIXED = depositValue is a raw amount,
-- PERCENT (system default going forward) = depositValue is a 0-100 rate.
-- Existing rows keep their prior percentage value (as PERCENT) rather than
-- silently jumping to the new 50% default.
ALTER TABLE "Project" ADD COLUMN "depositType" TEXT NOT NULL DEFAULT 'PERCENT';
ALTER TABLE "Project" ADD COLUMN "depositValue" INTEGER NOT NULL DEFAULT 50;

UPDATE "Project" SET "depositValue" = "depositPercent";

ALTER TABLE "Project" DROP COLUMN "depositPercent";
