-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "phone" VARCHAR(32) NOT NULL,
    "cccd" VARCHAR(32) NOT NULL,
    "guildId" VARCHAR(32) NOT NULL,
    "discordUserId" VARCHAR(32) NOT NULL,
    "email" VARCHAR(254),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "update_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_guildId_discordUserId_key" ON "users"("guildId", "discordUserId");
