-- This migration aligns the database with the Prisma schema change:
-- VocabMastery @@index([vocabId, userId])
--
-- Note: There is already a UNIQUE constraint on (vocab_id, user_id) via @@unique([vocabId, userId]).
-- This non-unique index is redundant but created to match the schema.

CREATE INDEX IF NOT EXISTS "vocab_mastery_vocab_id_user_id_idx"
ON "vocab_mastery" ("vocab_id", "user_id");

