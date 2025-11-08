-- CreateEnum
CREATE TYPE "ConfigScope" AS ENUM ('SYSTEM', 'USER');

-- DropIndex
DROP INDEX "subject_name_idx";

-- DropIndex
DROP INDEX "vocab_language_folder_id_source_language_code_target_langua_idx";

-- DropIndex
DROP INDEX "vocab_source_language_code_idx";

-- DropIndex
DROP INDEX "vocab_target_language_code_idx";

-- CreateTable
CREATE TABLE "config" (
    "id" TEXT NOT NULL,
    "scope" "ConfigScope" NOT NULL DEFAULT 'SYSTEM',
    "user_id" TEXT,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "config_key_is_active_idx" ON "config"("key", "is_active");

-- CreateIndex
CREATE INDEX "config_scope_user_id_idx" ON "config"("scope", "user_id");

-- CreateIndex
CREATE INDEX "config_user_id_idx" ON "config"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "config_scope_user_id_key_key" ON "config"("scope", "user_id", "key");

-- CreateIndex
CREATE INDEX "subject_user_id_name_idx" ON "subject"("user_id", "name");

-- CreateIndex
CREATE INDEX "vocab_language_folder_id_idx" ON "vocab"("language_folder_id");

-- AddForeignKey
ALTER TABLE "config" ADD CONSTRAINT "config_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "vocab_text_source_source_language_code_target_language_code_lan" RENAME TO "vocab_text_source_source_language_code_target_language_code_key";
