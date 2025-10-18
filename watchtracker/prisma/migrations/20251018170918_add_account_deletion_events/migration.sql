-- CreateTable
CREATE TABLE "AccountDeletionEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "tokenValid" BOOLEAN NOT NULL,
    "userId" TEXT,
    "username" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB NOT NULL,

    CONSTRAINT "AccountDeletionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountDeletionEvent_provider_receivedAt_idx" ON "AccountDeletionEvent"("provider", "receivedAt");
