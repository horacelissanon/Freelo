-- Admin alerts — proactive operational/security signals for ADMIN/SUPERADMIN,
-- distinct from AdminAction (audit log of admin-taken actions) and
-- Notification (user-scoped). No "owner" column: a platform-wide signal
-- visible to every admin, acknowledged by whichever admin handles it.

-- CreateTable
CREATE TABLE "AdminAlert" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "dedupeKey" TEXT NOT NULL,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminAlert_dedupeKey_key" ON "AdminAlert"("dedupeKey");

-- CreateIndex
CREATE INDEX "AdminAlert_severity_acknowledgedAt_createdAt_idx" ON "AdminAlert"("severity", "acknowledgedAt", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAlert_type_createdAt_idx" ON "AdminAlert"("type", "createdAt");

-- AddForeignKey
ALTER TABLE "AdminAlert" ADD CONSTRAINT "AdminAlert_acknowledgedBy_fkey" FOREIGN KEY ("acknowledgedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
