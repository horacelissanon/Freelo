-- CreateTable
CREATE TABLE "DefaultPaymentMethod" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "primaryText" TEXT NOT NULL,
    "secondaryText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DefaultPaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DefaultPaymentMethod_userId_order_idx" ON "DefaultPaymentMethod"("userId", "order");

-- AddForeignKey
ALTER TABLE "DefaultPaymentMethod" ADD CONSTRAINT "DefaultPaymentMethod_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
