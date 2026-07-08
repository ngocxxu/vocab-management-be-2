-- CreateEnum
CREATE TYPE "ApiKeyScope" AS ENUM ('QUICK_ADD_VOCAB');

-- CreateTable
CREATE TABLE "api_key" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "key_prefix" TEXT NOT NULL,
    "scopes" "ApiKeyScope"[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),
    "user_id" TEXT NOT NULL,
    "language_folder_id" TEXT,

    CONSTRAINT "api_key_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "api_key_key_hash_key" ON "api_key"("key_hash");

-- CreateIndex
CREATE INDEX "api_key_user_id_idx" ON "api_key"("user_id");

-- CreateIndex
CREATE INDEX "api_key_key_hash_idx" ON "api_key"("key_hash");

-- AddForeignKey
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_language_folder_id_fkey" FOREIGN KEY ("language_folder_id") REFERENCES "language_folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
