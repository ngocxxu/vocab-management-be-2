-- CreateEnum
CREATE TYPE "TrainerMode" AS ENUM ('CLASSIC', 'FSRS');

-- CreateEnum
CREATE TYPE "FsrsState" AS ENUM ('NEW', 'LEARNING', 'REVIEW', 'RELEARNING');

-- CreateEnum
CREATE TYPE "FsrsRating" AS ENUM ('AGAIN', 'HARD', 'GOOD', 'EASY');

-- DropForeignKey
ALTER TABLE "vocab_trainer_word" DROP CONSTRAINT "vocab_trainer_word_vocab_id_fkey";

-- AlterTable
ALTER TABLE "vocab_trainer" ADD COLUMN     "fsrs_allow_review_ahead" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "fsrs_desired_retention" DOUBLE PRECISION NOT NULL DEFAULT 0.9,
ADD COLUMN     "fsrs_maximum_interval" INTEGER NOT NULL DEFAULT 36500,
ADD COLUMN     "fsrs_new_per_day" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "fsrs_reviews_per_day" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "mode" "TrainerMode" NOT NULL DEFAULT 'CLASSIC';

-- CreateTable
CREATE TABLE "vocab_fsrs_card" (
    "id" TEXT NOT NULL,
    "vocab_trainer_id" TEXT NOT NULL,
    "vocab_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "state" "FsrsState" NOT NULL DEFAULT 'NEW',
    "due" TIMESTAMPTZ NOT NULL,
    "stability" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "difficulty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reps" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "scheduled_days" INTEGER NOT NULL DEFAULT 0,
    "learning_steps" INTEGER NOT NULL DEFAULT 0,
    "last_reviewed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vocab_fsrs_card_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vocab_fsrs_review_log" (
    "id" TEXT NOT NULL,
    "answer_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "vocab_id" TEXT NOT NULL,
    "vocab_trainer_id" TEXT NOT NULL,
    "rating" "FsrsRating" NOT NULL,
    "prev_state" "FsrsState" NOT NULL,
    "elapsed_days" INTEGER NOT NULL,
    "state_after" "FsrsState" NOT NULL,
    "due_after" TIMESTAMPTZ NOT NULL,
    "stability_after" DOUBLE PRECISION NOT NULL,
    "difficulty_after" DOUBLE PRECISION NOT NULL,
    "scheduled_days_after" INTEGER NOT NULL,
    "desired_retention_at_review" DOUBLE PRECISION NOT NULL,
    "duration_ms" INTEGER,
    "question_type" "QuestionType" NOT NULL,
    "is_ahead" BOOLEAN NOT NULL DEFAULT false,
    "reviewed_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vocab_fsrs_review_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vocab_fsrs_card_vocab_trainer_id_due_idx" ON "vocab_fsrs_card"("vocab_trainer_id", "due");

-- CreateIndex
CREATE INDEX "vocab_fsrs_card_user_id_due_idx" ON "vocab_fsrs_card"("user_id", "due");

-- CreateIndex
CREATE INDEX "vocab_fsrs_card_vocab_id_idx" ON "vocab_fsrs_card"("vocab_id");

-- CreateIndex
CREATE UNIQUE INDEX "vocab_fsrs_card_vocab_trainer_id_vocab_id_key" ON "vocab_fsrs_card"("vocab_trainer_id", "vocab_id");

-- CreateIndex
CREATE UNIQUE INDEX "vocab_fsrs_review_log_answer_id_key" ON "vocab_fsrs_review_log"("answer_id");

-- CreateIndex
CREATE INDEX "vocab_fsrs_review_log_user_id_reviewed_at_idx" ON "vocab_fsrs_review_log"("user_id", "reviewed_at");

-- CreateIndex
CREATE INDEX "vocab_fsrs_review_log_vocab_trainer_id_reviewed_at_idx" ON "vocab_fsrs_review_log"("vocab_trainer_id", "reviewed_at");

-- CreateIndex
CREATE INDEX "vocab_fsrs_review_log_vocab_trainer_id_vocab_id_reviewed_at_idx" ON "vocab_fsrs_review_log"("vocab_trainer_id", "vocab_id", "reviewed_at");

-- CreateIndex
CREATE INDEX "vocab_fsrs_review_log_vocab_id_idx" ON "vocab_fsrs_review_log"("vocab_id");

-- AddForeignKey
ALTER TABLE "vocab_trainer_word" ADD CONSTRAINT "vocab_trainer_word_vocab_id_fkey" FOREIGN KEY ("vocab_id") REFERENCES "vocab"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vocab_fsrs_card" ADD CONSTRAINT "vocab_fsrs_card_vocab_trainer_id_fkey" FOREIGN KEY ("vocab_trainer_id") REFERENCES "vocab_trainer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vocab_fsrs_card" ADD CONSTRAINT "vocab_fsrs_card_vocab_id_fkey" FOREIGN KEY ("vocab_id") REFERENCES "vocab"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vocab_fsrs_card" ADD CONSTRAINT "vocab_fsrs_card_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vocab_fsrs_review_log" ADD CONSTRAINT "vocab_fsrs_review_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vocab_fsrs_review_log" ADD CONSTRAINT "vocab_fsrs_review_log_vocab_id_fkey" FOREIGN KEY ("vocab_id") REFERENCES "vocab"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vocab_fsrs_review_log" ADD CONSTRAINT "vocab_fsrs_review_log_vocab_trainer_id_fkey" FOREIGN KEY ("vocab_trainer_id") REFERENCES "vocab_trainer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CHECK constraints (hand-written: Prisma cannot declare them). Keep in sync with the comment on model VocabFsrsCard.
ALTER TABLE "vocab_trainer"
    ADD CONSTRAINT "vocab_trainer_fsrs_desired_retention_check" CHECK ("fsrs_desired_retention" BETWEEN 0.70 AND 0.97),
    ADD CONSTRAINT "vocab_trainer_fsrs_maximum_interval_check" CHECK ("fsrs_maximum_interval" >= 1),
    ADD CONSTRAINT "vocab_trainer_fsrs_new_per_day_check" CHECK ("fsrs_new_per_day" >= 0),
    ADD CONSTRAINT "vocab_trainer_fsrs_reviews_per_day_check" CHECK ("fsrs_reviews_per_day" >= 0);

ALTER TABLE "vocab_fsrs_card"
    ADD CONSTRAINT "vocab_fsrs_card_stability_check" CHECK ("stability" >= 0),
    ADD CONSTRAINT "vocab_fsrs_card_difficulty_check" CHECK ("difficulty" = 0 OR "difficulty" BETWEEN 1 AND 10),
    ADD CONSTRAINT "vocab_fsrs_card_counters_check" CHECK ("reps" >= 0 AND "lapses" >= 0 AND "scheduled_days" >= 0 AND "learning_steps" >= 0);
