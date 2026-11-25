-- CreateTable
-- Latest AI-graded submit (fill-in-blank or audio) per trainer: answers and question snapshot, grading state, regrade count (#17).
-- No backfill: submits made before this migration have no row, so their jobs are allowed to write (see the stale-job guard).
CREATE TABLE "vocab_trainer_attempt" (
    "id" TEXT NOT NULL,
    "trainer_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "submitted_at" TIMESTAMPTZ NOT NULL,
    "counts_as_attempt" BOOLEAN NOT NULL,
    "grading_status" TEXT NOT NULL,
    "regrade_count" INTEGER NOT NULL DEFAULT 0,
    "answers_snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "vocab_trainer_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vocab_trainer_attempt_trainer_id_key" ON "vocab_trainer_attempt"("trainer_id");

-- CreateIndex
CREATE INDEX "vocab_trainer_attempt_user_id_idx" ON "vocab_trainer_attempt"("user_id");

-- AddForeignKey
ALTER TABLE "vocab_trainer_attempt" ADD CONSTRAINT "vocab_trainer_attempt_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "vocab_trainer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vocab_trainer_attempt" ADD CONSTRAINT "vocab_trainer_attempt_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- CHECK constraints (Prisma cannot declare them). Keep in sync with VocabTrainerAttempt in schema.prisma and attempt-snapshot.util.ts.
ALTER TABLE "vocab_trainer_attempt"
    ADD CONSTRAINT "vocab_trainer_attempt_kind_check" CHECK ("kind" IN ('fill-in-blank', 'audio')),
    ADD CONSTRAINT "vocab_trainer_attempt_grading_status_check" CHECK ("grading_status" IN ('grading', 'graded', 'grading_failed')),
    ADD CONSTRAINT "vocab_trainer_attempt_regrade_count_check" CHECK ("regrade_count" BETWEEN 0 AND 2);
