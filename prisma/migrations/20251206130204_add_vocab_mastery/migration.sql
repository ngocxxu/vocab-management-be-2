-- AlterTable
ALTER TABLE "vocab_trainer_result" ADD COLUMN     "vocab_id" TEXT;

-- CreateTable
CREATE TABLE "vocab_mastery" (
    "id" TEXT NOT NULL,
    "vocab_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "mastery_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "correct_count" INTEGER NOT NULL DEFAULT 0,
    "incorrect_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vocab_mastery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vocab_mastery_history" (
    "id" TEXT NOT NULL,
    "vocab_mastery_id" TEXT NOT NULL,
    "mastery_score" DOUBLE PRECISION NOT NULL,
    "correct_count" INTEGER NOT NULL,
    "incorrect_count" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vocab_mastery_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vocab_mastery_vocab_id_idx" ON "vocab_mastery"("vocab_id");

-- CreateIndex
CREATE INDEX "vocab_mastery_user_id_idx" ON "vocab_mastery"("user_id");

-- CreateIndex
CREATE INDEX "vocab_mastery_user_id_incorrect_count_idx" ON "vocab_mastery"("user_id", "incorrect_count");

-- CreateIndex
CREATE INDEX "vocab_mastery_user_id_mastery_score_idx" ON "vocab_mastery"("user_id", "mastery_score");

-- CreateIndex
CREATE UNIQUE INDEX "vocab_mastery_vocab_id_user_id_key" ON "vocab_mastery"("vocab_id", "user_id");

-- CreateIndex
CREATE INDEX "vocab_mastery_history_vocab_mastery_id_created_at_idx" ON "vocab_mastery_history"("vocab_mastery_id", "created_at");

-- CreateIndex
CREATE INDEX "vocab_mastery_history_created_at_idx" ON "vocab_mastery_history"("created_at");

-- CreateIndex
CREATE INDEX "vocab_trainer_result_vocab_id_idx" ON "vocab_trainer_result"("vocab_id");

-- CreateIndex
CREATE INDEX "vocab_trainer_result_vocab_id_status_idx" ON "vocab_trainer_result"("vocab_id", "status");

-- AddForeignKey
ALTER TABLE "vocab_trainer_result" ADD CONSTRAINT "vocab_trainer_result_vocab_id_fkey" FOREIGN KEY ("vocab_id") REFERENCES "vocab"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vocab_mastery" ADD CONSTRAINT "vocab_mastery_vocab_id_fkey" FOREIGN KEY ("vocab_id") REFERENCES "vocab"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vocab_mastery" ADD CONSTRAINT "vocab_mastery_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vocab_mastery_history" ADD CONSTRAINT "vocab_mastery_history_vocab_mastery_id_fkey" FOREIGN KEY ("vocab_mastery_id") REFERENCES "vocab_mastery"("id") ON DELETE CASCADE ON UPDATE CASCADE;
