-- AlterTable: add target_language_code column
ALTER TABLE "subject"
    ADD COLUMN "target_language_code" VARCHAR(10);

-- DropIndex: remove the old per-user name unique constraint
DROP INDEX IF EXISTS "subject_user_id_name_key";

-- DropIndex: remove the old non-unique index on (user_id, name)
DROP INDEX IF EXISTS "subject_user_id_name_idx";

-- AddForeignKey: link target_language_code to language.code
ALTER TABLE "subject"
    ADD CONSTRAINT "subject_target_language_code_fkey"
    FOREIGN KEY ("target_language_code") REFERENCES "language"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex: fast lookup by user + language
CREATE INDEX "subject_user_id_target_language_code_idx" ON "subject"("user_id", "target_language_code");

-- CreateIndex: case-insensitive unique per (user, language, name) — only enforced when language is set
CREATE UNIQUE INDEX "subject_user_id_target_lang_lower_name_key"
    ON "subject"("user_id", "target_language_code", LOWER("name"))
    WHERE "target_language_code" IS NOT NULL;
