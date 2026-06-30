-- CreateEnum
CREATE TYPE "ChatRole" AS ENUM ('USER', 'ASSISTANT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ReminderChannel" ADD VALUE 'SMS';
ALTER TYPE "ReminderChannel" ADD VALUE 'PUSH';
ALTER TYPE "ReminderChannel" ADD VALUE 'IN_APP';
ALTER TYPE "ReminderChannel" ADD VALUE 'DISCORD';
ALTER TYPE "ReminderChannel" ADD VALUE 'ZALO';

-- AlterEnum
BEGIN;
CREATE TYPE "UserRole_new" AS ENUM ('ADMIN', 'MEMBER', 'GUEST');
ALTER TABLE "user" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "plan" ALTER COLUMN "role" TYPE "UserRole_new" USING ("role"::text::"UserRole_new");
ALTER TABLE "user" ALTER COLUMN "role" TYPE "UserRole_new" USING ("role"::text::"UserRole_new");
ALTER TYPE "UserRole" RENAME TO "UserRole_old";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
DROP TYPE "UserRole_old";
ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'GUEST';
COMMIT;

-- DropForeignKey
ALTER TABLE "subject" DROP CONSTRAINT "subject_target_language_code_fkey";

-- DropIndex
DROP INDEX "vocab_mastery_vocab_id_idx";

-- AlterTable
ALTER TABLE "subject" ALTER COLUMN "target_language_code" SET DATA TYPE TEXT;

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "ChatRole" NOT NULL,
    "content" TEXT NOT NULL,
    "tool_calls" JSONB,
    "token_count" INTEGER,
    "latency_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chat_messages_user_id_created_at_idx" ON "chat_messages"("user_id", "created_at" ASC);

-- AddForeignKey
ALTER TABLE "subject" ADD CONSTRAINT "subject_target_language_code_fkey" FOREIGN KEY ("target_language_code") REFERENCES "language"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
