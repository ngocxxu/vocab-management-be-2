CREATE TABLE "vocab_related_word" (
    "id" TEXT NOT NULL,
    "vocab_id" TEXT NOT NULL,
    "linked_vocab_id" TEXT,
    "free_text" TEXT,
    "is_synonym" BOOLEAN NOT NULL DEFAULT false,
    "is_antonym" BOOLEAN NOT NULL DEFAULT false,
    "is_related" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vocab_related_word_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vocab_related_word_exactly_one_source_check" CHECK (
        ("linked_vocab_id" IS NOT NULL AND "free_text" IS NULL) OR
        ("linked_vocab_id" IS NULL AND "free_text" IS NOT NULL)
    ),
    CONSTRAINT "vocab_related_word_flags_check" CHECK (NOT ("is_synonym" AND "is_antonym")),
    CONSTRAINT "vocab_related_word_at_least_one_check" CHECK ("is_synonym" OR "is_antonym" OR "is_related")
);

CREATE INDEX "vocab_related_word_vocab_id_idx" ON "vocab_related_word"("vocab_id");
CREATE INDEX "vocab_related_word_linked_vocab_id_idx" ON "vocab_related_word"("linked_vocab_id");
CREATE INDEX "vocab_related_word_vocab_id_free_text_idx" ON "vocab_related_word"("vocab_id", "free_text");
CREATE INDEX "vocab_related_word_vocab_id_is_synonym_idx" ON "vocab_related_word"("vocab_id", "is_synonym");
CREATE INDEX "vocab_related_word_vocab_id_is_antonym_idx" ON "vocab_related_word"("vocab_id", "is_antonym");
CREATE INDEX "vocab_related_word_vocab_id_is_related_idx" ON "vocab_related_word"("vocab_id", "is_related");
CREATE UNIQUE INDEX "vocab_related_word_vocab_id_linked_vocab_id_unique" ON "vocab_related_word"("vocab_id", "linked_vocab_id") WHERE "linked_vocab_id" IS NOT NULL;
CREATE UNIQUE INDEX "vocab_related_word_vocab_id_free_text_unique" ON "vocab_related_word"("vocab_id", "free_text") WHERE "free_text" IS NOT NULL;
CREATE INDEX "vocab_related_word_upgradeable_idx" ON "vocab_related_word"("vocab_id", "free_text") WHERE "free_text" IS NOT NULL AND "linked_vocab_id" IS NULL;

ALTER TABLE "vocab_related_word"
ADD CONSTRAINT "vocab_related_word_vocab_id_fkey"
FOREIGN KEY ("vocab_id") REFERENCES "vocab"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vocab_related_word"
ADD CONSTRAINT "vocab_related_word_linked_vocab_id_fkey"
FOREIGN KEY ("linked_vocab_id") REFERENCES "vocab"("id") ON DELETE CASCADE ON UPDATE CASCADE;
