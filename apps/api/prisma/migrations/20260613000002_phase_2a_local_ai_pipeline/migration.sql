-- Phase 2A local AI pipeline quality tracking
CREATE TABLE "ImageQualityScore" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "processingJobId" TEXT NOT NULL,
    "providerName" TEXT NOT NULL,
    "imageStorageKey" TEXT,
    "productDetected" BOOLEAN NOT NULL DEFAULT true,
    "confidence" DOUBLE PRECISION NOT NULL,
    "blurScore" DOUBLE PRECISION NOT NULL,
    "brightnessScore" DOUBLE PRECISION NOT NULL,
    "contrastScore" DOUBLE PRECISION NOT NULL,
    "visibilityScore" DOUBLE PRECISION NOT NULL,
    "cropQualityScore" DOUBLE PRECISION NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "boundingBoxLeft" INTEGER,
    "boundingBoxTop" INTEGER,
    "boundingBoxWidth" INTEGER,
    "boundingBoxHeight" INTEGER,
    "cropLeft" INTEGER,
    "cropTop" INTEGER,
    "cropRight" INTEGER,
    "cropBottom" INTEGER,
    "sourceWidth" INTEGER,
    "sourceHeight" INTEGER,
    "canvasWidth" INTEGER,
    "canvasHeight" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImageQualityScore_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ImageQualityScore"
    ADD CONSTRAINT "ImageQualityScore_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ImageQualityScore"
    ADD CONSTRAINT "ImageQualityScore_processingJobId_fkey"
    FOREIGN KEY ("processingJobId") REFERENCES "ProcessingJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "ImageQualityScore_orderId_createdAt_idx" ON "ImageQualityScore"("orderId", "createdAt");
CREATE INDEX "ImageQualityScore_processingJobId_createdAt_idx" ON "ImageQualityScore"("processingJobId", "createdAt");
CREATE INDEX "ImageQualityScore_providerName_createdAt_idx" ON "ImageQualityScore"("providerName", "createdAt");
