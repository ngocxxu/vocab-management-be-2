-- AlterTable
ALTER TABLE "vocab_embedding_state" ADD COLUMN     "embedding_spec" TEXT;

-- Backfill: rows already embedded under the current EMBEDDING_SPEC (gemini-embedding-001:768)
-- count as up to date, so this deploy does not re-embed the whole table. Rows with
-- content_hash IS NULL (never embedded, or empty-text skip) are left NULL — they were
-- already due before this migration and stay due after it.
UPDATE "vocab_embedding_state" SET "embedding_spec" = 'gemini-embedding-001:768' WHERE "content_hash" IS NOT NULL;
