-- AlterTable
ALTER TABLE "user" ADD COLUMN "email_confirmed" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: all existing rows are already confirmed users
UPDATE "user" SET "email_confirmed" = true;

-- CreateIndex (partial) for cleanup cron query performance
CREATE INDEX "user_email_confirmed_created_at_idx"
    ON "user" ("email_confirmed", "created_at")
    WHERE "email_confirmed" = false;
