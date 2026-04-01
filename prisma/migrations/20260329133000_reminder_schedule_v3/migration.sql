-- CreateEnum
CREATE TYPE "ReminderChannel" AS ENUM ('EMAIL');

-- CreateEnum
CREATE TYPE "ReminderScheduleKind" AS ENUM ('INITIAL', 'ESCALATION');

-- CreateEnum
CREATE TYPE "ReminderScheduleStatus" AS ENUM (
  'PENDING',
  'CLAIMED',
  'QUEUED',
  'SENDING',
  'SENT',
  'FAILED_RETRYABLE',
  'FAILED_TERMINAL',
  'EXPIRED',
  'CANCELLED'
);

-- AlterTable
ALTER TABLE "vocab_trainer" ADD COLUMN "last_exam_submitted_at" TIMESTAMPTZ;

-- CreateTable
CREATE TABLE "reminder_schedule" (
    "id" TEXT NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "channel" "ReminderChannel" NOT NULL DEFAULT 'EMAIL',
    "recipient" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "template_version" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "subject" TEXT,
    "due_at" TIMESTAMPTZ NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "status" "ReminderScheduleStatus" NOT NULL DEFAULT 'PENDING',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "next_attempt_at" TIMESTAMPTZ,
    "locked_by" TEXT,
    "locked_at" TIMESTAMPTZ,
    "last_error_code" TEXT,
    "last_error_msg" TEXT,
    "error_history" JSONB NOT NULL DEFAULT '[]',
    "provider_msg_id" TEXT,
    "reminder_type" "ReminderScheduleKind" NOT NULL DEFAULT 'INITIAL',
    "escalation_level" INTEGER NOT NULL DEFAULT 0,
    "escalation_max" INTEGER NOT NULL DEFAULT 3,
    "initial_reminder_id" TEXT,
    "acted_check_after" TIMESTAMPTZ,
    "chain_count" INTEGER NOT NULL DEFAULT 0,
    "chain_max" INTEGER NOT NULL DEFAULT 30,
    "cancelled_at" TIMESTAMPTZ,
    "cancelled_by" TEXT,
    "cancel_reason" TEXT,
    "sent_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "user_id" TEXT,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reminder_schedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reminder_schedule_status_due_at_priority_idx" ON "reminder_schedule"("status", "due_at", "priority" DESC);

-- CreateIndex
CREATE INDEX "reminder_schedule_status_locked_at_idx" ON "reminder_schedule"("status", "locked_at");

-- CreateIndex
CREATE INDEX "reminder_schedule_initial_reminder_id_escalation_level_idx" ON "reminder_schedule"("initial_reminder_id", "escalation_level");

-- CreateIndex
CREATE INDEX "reminder_schedule_entity_type_entity_id_status_idx" ON "reminder_schedule"("entity_type", "entity_id", "status");

-- CreateIndex
CREATE INDEX "reminder_schedule_user_id_status_due_at_idx" ON "reminder_schedule"("user_id", "status", "due_at");

-- Partial unique: one active dedupe_key per logical send intent
CREATE UNIQUE INDEX "reminder_schedule_dedupe_key_active_idx" ON "reminder_schedule" ("dedupe_key")
WHERE "status" NOT IN ('CANCELLED', 'EXPIRED');

-- AddForeignKey
ALTER TABLE "reminder_schedule" ADD CONSTRAINT "reminder_schedule_initial_reminder_id_fkey" FOREIGN KEY ("initial_reminder_id") REFERENCES "reminder_schedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_schedule" ADD CONSTRAINT "reminder_schedule_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
