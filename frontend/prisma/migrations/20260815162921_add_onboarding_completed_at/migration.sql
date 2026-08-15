-- Onboarding: first-run setup wizard + product tour completion marker.
ALTER TABLE "User" ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3);

-- Backfill existing users to their createdAt so only NEW signups (created
-- after this migration) see the onboarding wizard on first login.
UPDATE "User" SET "onboardingCompletedAt" = "createdAt" WHERE "onboardingCompletedAt" IS NULL;
