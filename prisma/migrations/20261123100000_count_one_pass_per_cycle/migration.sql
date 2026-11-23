-- AlterTable
-- Classic reminder cycle (#42): spacing X, max Passes T, fail streak and the last counted attempt.
-- Existing trainers get the defaults (X = 2, T = 6, streak = 0, never counted).
ALTER TABLE "vocab_trainer"
    ADD COLUMN "reminder_spacing_days" INTEGER NOT NULL DEFAULT 2,
    ADD COLUMN "reminder_max_repeat" INTEGER NOT NULL DEFAULT 6,
    ADD COLUMN "reminder_fail_streak" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "reminder_last_counted_at" TIMESTAMPTZ;

-- CHECK constraints (Prisma cannot declare them). Keep in sync with the ranges in pass-rules.util.ts.
ALTER TABLE "vocab_trainer"
    ADD CONSTRAINT "vocab_trainer_reminder_spacing_days_check" CHECK ("reminder_spacing_days" BETWEEN 2 AND 30),
    ADD CONSTRAINT "vocab_trainer_reminder_max_repeat_check" CHECK ("reminder_max_repeat" BETWEEN 3 AND 20),
    ADD CONSTRAINT "vocab_trainer_reminder_fail_streak_check" CHECK ("reminder_fail_streak" >= 0);
