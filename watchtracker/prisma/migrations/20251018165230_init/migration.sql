-- CreateTable
CREATE TABLE "Model" (
    "id" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "family" TEXT,
    "ref" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "keywords" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Model_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoldListing" (
    "itemId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "categoryId" TEXT,
    "brand" TEXT,
    "family" TEXT,
    "ref" TEXT,
    "condition" TEXT,
    "sellerUsername" TEXT,
    "sellerFeedback" INTEGER,
    "price" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL,
    "priceUsd" DECIMAL(65,30) NOT NULL,
    "shippingCost" DECIMAL(65,30),
    "country" TEXT,
    "endTimeUtc" TIMESTAMP(3) NOT NULL,
    "sellingState" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "imageUrl" TEXT,
    "fullSet" BOOLEAN NOT NULL DEFAULT false,
    "raw" JSONB NOT NULL,
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modelId" TEXT,

    CONSTRAINT "SoldListing_pkey" PRIMARY KEY ("itemId")
);

-- CreateTable
CREATE TABLE "ModelMetric" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "window" TEXT NOT NULL,
    "mean" DECIMAL(65,30) NOT NULL,
    "median" DECIMAL(65,30) NOT NULL,
    "p25" DECIMAL(65,30) NOT NULL,
    "p75" DECIMAL(65,30) NOT NULL,
    "volume" INTEGER NOT NULL,
    "momChange" DECIMAL(65,30),
    "yoyChange" DECIMAL(65,30),
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WatchList" (
    "id" TEXT NOT NULL,
    "clientKey" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WatchList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrendAlert" (
    "id" TEXT NOT NULL,
    "clientKey" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "thresholdPct" DECIMAL(65,30) NOT NULL,
    "direction" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrendAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Model_brand_family_ref_idx" ON "Model"("brand", "family", "ref");

-- CreateIndex
CREATE UNIQUE INDEX "Model_brand_ref_key" ON "Model"("brand", "ref");

-- CreateIndex
CREATE INDEX "SoldListing_endTimeUtc_idx" ON "SoldListing"("endTimeUtc");

-- CreateIndex
CREATE INDEX "SoldListing_brand_ref_endTimeUtc_idx" ON "SoldListing"("brand", "ref", "endTimeUtc");

-- CreateIndex
CREATE INDEX "ModelMetric_modelId_window_computedAt_idx" ON "ModelMetric"("modelId", "window", "computedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WatchList_clientKey_modelId_key" ON "WatchList"("clientKey", "modelId");

-- AddForeignKey
ALTER TABLE "SoldListing" ADD CONSTRAINT "SoldListing_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "Model"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelMetric" ADD CONSTRAINT "ModelMetric_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "Model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
