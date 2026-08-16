-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "sector" TEXT,
ADD COLUMN     "type" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "sector" TEXT NOT NULL DEFAULT 'OTHER';

