-- Backstop expiry for SubscriptionTransaction PENDING rows — a checkout
-- session the user never completes (or a real failure SasPay never sends a
-- webhook for) would otherwise sit PENDING forever.
ALTER TABLE "SubscriptionTransaction" ADD COLUMN "expiresAt" TIMESTAMP(3);

CREATE INDEX "SubscriptionTransaction_status_expiresAt_idx" ON "SubscriptionTransaction"("status", "expiresAt");
