-- CreateEnum
CREATE TYPE "VerificationPromptDelivery" AS ENUM ('DM', 'CHANNEL');

-- CreateTable
CREATE TABLE "verification_prompts" (
    "id" SERIAL NOT NULL,
    "guildId" VARCHAR(32) NOT NULL,
    "discordUserId" VARCHAR(32) NOT NULL,
    "delivered_via" "VerificationPromptDelivery" NOT NULL,
    "prompted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_prompts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "verification_prompts_guildId_discordUserId_key" ON "verification_prompts"("guildId", "discordUserId");
