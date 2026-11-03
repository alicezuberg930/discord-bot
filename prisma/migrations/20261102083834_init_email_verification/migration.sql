-- CreateEnum
CREATE TYPE "EmailVerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'EXPIRED', 'LOCKED');

-- CreateTable
CREATE TABLE "email_verifications" (
    "id" UUID NOT NULL,
    "guildId" VARCHAR(32) NOT NULL,
    "discordUserId" VARCHAR(32) NOT NULL,
    "email" VARCHAR(254),
    "emailMasked" VARCHAR(254),
    "status" "EmailVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "otpHash" CHAR(64),
    "otpExpiresAt" TIMESTAMP(3),
    "resendAvailableAt" TIMESTAMP(3),
    "attemptsRemaining" INTEGER NOT NULL DEFAULT 0,
    "verifiedAt" TIMESTAMP(3),
    "verifiedRoleId" VARCHAR(32),
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "lastPromptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_verifications_status_otpExpiresAt_idx" ON "email_verifications"("status", "otpExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "email_verifications_guildId_discordUserId_key" ON "email_verifications"("guildId", "discordUserId");
