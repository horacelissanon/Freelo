-- CreateTable
CREATE TABLE "PlanConfig" (
    "id" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "monthlyAmount" INTEGER,
    "yearlyAmount" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "maxClients" INTEGER,
    "maxActiveProjects" INTEGER,
    "features" TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlanConfig_plan_key" ON "PlanConfig"("plan");
