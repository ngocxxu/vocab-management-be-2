/*
  Warnings:

  - You are about to drop the `Language` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Notification` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `NotificationRecipient` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Subject` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TextTarget` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TextTargetSubject` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `User` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Vocab` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `VocabExample` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `VocabTrainer` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `VocabTrainerResult` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `VocabTrainerWord` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `WordType` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "NotificationRecipient" DROP CONSTRAINT "NotificationRecipient_notificationId_fkey";

-- DropForeignKey
ALTER TABLE "NotificationRecipient" DROP CONSTRAINT "NotificationRecipient_userId_fkey";

-- DropForeignKey
ALTER TABLE "Subject" DROP CONSTRAINT "Subject_userId_fkey";

-- DropForeignKey
ALTER TABLE "TextTarget" DROP CONSTRAINT "TextTarget_vocabId_fkey";

-- DropForeignKey
ALTER TABLE "TextTarget" DROP CONSTRAINT "TextTarget_wordTypeId_fkey";

-- DropForeignKey
ALTER TABLE "TextTargetSubject" DROP CONSTRAINT "TextTargetSubject_subjectId_fkey";

-- DropForeignKey
ALTER TABLE "TextTargetSubject" DROP CONSTRAINT "TextTargetSubject_textTargetId_fkey";

-- DropForeignKey
ALTER TABLE "Vocab" DROP CONSTRAINT "Vocab_sourceLanguageCode_fkey";

-- DropForeignKey
ALTER TABLE "Vocab" DROP CONSTRAINT "Vocab_targetLanguageCode_fkey";

-- DropForeignKey
ALTER TABLE "Vocab" DROP CONSTRAINT "Vocab_userId_fkey";

-- DropForeignKey
ALTER TABLE "VocabExample" DROP CONSTRAINT "VocabExample_textTargetId_fkey";

-- DropForeignKey
ALTER TABLE "VocabTrainer" DROP CONSTRAINT "VocabTrainer_userId_fkey";

-- DropForeignKey
ALTER TABLE "VocabTrainerResult" DROP CONSTRAINT "VocabTrainerResult_vocabTrainerId_fkey";

-- DropForeignKey
ALTER TABLE "VocabTrainerWord" DROP CONSTRAINT "VocabTrainerWord_vocabId_fkey";

-- DropForeignKey
ALTER TABLE "VocabTrainerWord" DROP CONSTRAINT "VocabTrainerWord_vocabTrainerId_fkey";

-- DropTable
DROP TABLE "Language";

-- DropTable
DROP TABLE "Notification";

-- DropTable
DROP TABLE "NotificationRecipient";

-- DropTable
DROP TABLE "Subject";

-- DropTable
DROP TABLE "TextTarget";

-- DropTable
DROP TABLE "TextTargetSubject";

-- DropTable
DROP TABLE "User";

-- DropTable
DROP TABLE "Vocab";

-- DropTable
DROP TABLE "VocabExample";

-- DropTable
DROP TABLE "VocabTrainer";

-- DropTable
DROP TABLE "VocabTrainerResult";

-- DropTable
DROP TABLE "VocabTrainerWord";

-- DropTable
DROP TABLE "WordType";

-- CreateTable
CREATE TABLE "vocab" (
    "id" TEXT NOT NULL,
    "text_source" TEXT NOT NULL,
    "source_language_code" TEXT NOT NULL,
    "target_language_code" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vocab_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "language" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "language_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vocab_trainer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "TrainerStatus" NOT NULL,
    "count_time" INTEGER NOT NULL DEFAULT 0,
    "set_count_time" INTEGER NOT NULL DEFAULT 0,
    "reminder_time" INTEGER NOT NULL DEFAULT 0,
    "reminder_disabled" BOOLEAN NOT NULL DEFAULT false,
    "reminder_repeat" INTEGER NOT NULL DEFAULT 2,
    "reminder_last_remind" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "question_type" "QuestionType" NOT NULL DEFAULT 'MULTIPLE_CHOICE',
    "question_answers" JSONB[] DEFAULT ARRAY[]::JSONB[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "vocab_trainer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vocab_trainer_word" (
    "id" TEXT NOT NULL,
    "vocab_trainer_id" TEXT NOT NULL,
    "vocab_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vocab_trainer_word_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vocab_trainer_result" (
    "id" TEXT NOT NULL,
    "vocab_trainer_id" TEXT NOT NULL,
    "status" "TrainerStatus" NOT NULL,
    "user_selected" TEXT NOT NULL,
    "system_selected" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vocab_trainer_result_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "text_target" (
    "id" TEXT NOT NULL,
    "vocab_id" TEXT NOT NULL,
    "word_type_id" TEXT,
    "text_target" TEXT NOT NULL,
    "grammar" TEXT NOT NULL,
    "explanation_source" TEXT NOT NULL,
    "explanation_target" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "text_target_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vocab_example" (
    "id" TEXT NOT NULL,
    "text_target_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vocab_example_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "word_type" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "word_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subject" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "text_target_subject" (
    "id" TEXT NOT NULL,
    "text_target_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "text_target_subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "action" "NotificationAction" NOT NULL,
    "priority" "PriorityLevel" NOT NULL,
    "data" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_recipient" (
    "id" TEXT NOT NULL,
    "notification_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_recipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "phone" TEXT,
    "avatar" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'CUSTOMER',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "supabase_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vocab_text_source_idx" ON "vocab"("text_source");

-- CreateIndex
CREATE INDEX "vocab_created_at_idx" ON "vocab"("created_at");

-- CreateIndex
CREATE INDEX "vocab_updated_at_idx" ON "vocab"("updated_at");

-- CreateIndex
CREATE INDEX "vocab_source_language_code_idx" ON "vocab"("source_language_code");

-- CreateIndex
CREATE INDEX "vocab_target_language_code_idx" ON "vocab"("target_language_code");

-- CreateIndex
CREATE INDEX "vocab_source_language_code_target_language_code_idx" ON "vocab"("source_language_code", "target_language_code");

-- CreateIndex
CREATE UNIQUE INDEX "vocab_text_source_source_language_code_target_language_code_key" ON "vocab"("text_source", "source_language_code", "target_language_code");

-- CreateIndex
CREATE UNIQUE INDEX "language_code_key" ON "language"("code");

-- CreateIndex
CREATE INDEX "language_name_idx" ON "language"("name");

-- CreateIndex
CREATE INDEX "language_code_idx" ON "language"("code");

-- CreateIndex
CREATE INDEX "vocab_trainer_status_idx" ON "vocab_trainer"("status");

-- CreateIndex
CREATE INDEX "vocab_trainer_status_created_at_idx" ON "vocab_trainer"("status", "created_at");

-- CreateIndex
CREATE INDEX "vocab_trainer_reminder_disabled_reminder_last_remind_idx" ON "vocab_trainer"("reminder_disabled", "reminder_last_remind");

-- CreateIndex
CREATE INDEX "vocab_trainer_created_at_idx" ON "vocab_trainer"("created_at");

-- CreateIndex
CREATE INDEX "vocab_trainer_name_idx" ON "vocab_trainer"("name");

-- CreateIndex
CREATE INDEX "vocab_trainer_word_vocab_trainer_id_idx" ON "vocab_trainer_word"("vocab_trainer_id");

-- CreateIndex
CREATE INDEX "vocab_trainer_word_vocab_id_idx" ON "vocab_trainer_word"("vocab_id");

-- CreateIndex
CREATE INDEX "vocab_trainer_word_vocab_trainer_id_created_at_idx" ON "vocab_trainer_word"("vocab_trainer_id", "created_at");

-- CreateIndex
CREATE INDEX "vocab_trainer_word_created_at_idx" ON "vocab_trainer_word"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "vocab_trainer_word_vocab_trainer_id_vocab_id_key" ON "vocab_trainer_word"("vocab_trainer_id", "vocab_id");

-- CreateIndex
CREATE INDEX "vocab_trainer_result_vocab_trainer_id_idx" ON "vocab_trainer_result"("vocab_trainer_id");

-- CreateIndex
CREATE INDEX "vocab_trainer_result_vocab_trainer_id_status_idx" ON "vocab_trainer_result"("vocab_trainer_id", "status");

-- CreateIndex
CREATE INDEX "vocab_trainer_result_vocab_trainer_id_created_at_idx" ON "vocab_trainer_result"("vocab_trainer_id", "created_at");

-- CreateIndex
CREATE INDEX "vocab_trainer_result_status_idx" ON "vocab_trainer_result"("status");

-- CreateIndex
CREATE INDEX "vocab_trainer_result_created_at_idx" ON "vocab_trainer_result"("created_at");

-- CreateIndex
CREATE INDEX "text_target_vocab_id_idx" ON "text_target"("vocab_id");

-- CreateIndex
CREATE INDEX "text_target_word_type_id_idx" ON "text_target"("word_type_id");

-- CreateIndex
CREATE INDEX "text_target_text_target_idx" ON "text_target"("text_target");

-- CreateIndex
CREATE INDEX "text_target_created_at_idx" ON "text_target"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "text_target_vocab_id_text_target_key" ON "text_target"("vocab_id", "text_target");

-- CreateIndex
CREATE INDEX "vocab_example_text_target_id_idx" ON "vocab_example"("text_target_id");

-- CreateIndex
CREATE INDEX "vocab_example_text_target_id_created_at_idx" ON "vocab_example"("text_target_id", "created_at");

-- CreateIndex
CREATE INDEX "vocab_example_source_idx" ON "vocab_example"("source");

-- CreateIndex
CREATE INDEX "vocab_example_target_idx" ON "vocab_example"("target");

-- CreateIndex
CREATE UNIQUE INDEX "word_type_name_key" ON "word_type"("name");

-- CreateIndex
CREATE INDEX "word_type_name_idx" ON "word_type"("name");

-- CreateIndex
CREATE UNIQUE INDEX "subject_name_key" ON "subject"("name");

-- CreateIndex
CREATE INDEX "subject_order_idx" ON "subject"("order");

-- CreateIndex
CREATE INDEX "subject_name_idx" ON "subject"("name");

-- CreateIndex
CREATE INDEX "text_target_subject_text_target_id_idx" ON "text_target_subject"("text_target_id");

-- CreateIndex
CREATE INDEX "text_target_subject_subject_id_idx" ON "text_target_subject"("subject_id");

-- CreateIndex
CREATE INDEX "text_target_subject_subject_id_text_target_id_idx" ON "text_target_subject"("subject_id", "text_target_id");

-- CreateIndex
CREATE UNIQUE INDEX "text_target_subject_text_target_id_subject_id_key" ON "text_target_subject"("text_target_id", "subject_id");

-- CreateIndex
CREATE INDEX "notification_type_is_active_idx" ON "notification"("type", "is_active");

-- CreateIndex
CREATE INDEX "notification_priority_is_active_idx" ON "notification"("priority", "is_active");

-- CreateIndex
CREATE INDEX "notification_is_active_expires_at_idx" ON "notification"("is_active", "expires_at");

-- CreateIndex
CREATE INDEX "notification_is_active_created_at_idx" ON "notification"("is_active", "created_at");

-- CreateIndex
CREATE INDEX "notification_created_at_idx" ON "notification"("created_at");

-- CreateIndex
CREATE INDEX "notification_recipient_user_id_is_read_is_deleted_idx" ON "notification_recipient"("user_id", "is_read", "is_deleted");

-- CreateIndex
CREATE INDEX "notification_recipient_user_id_is_deleted_created_at_idx" ON "notification_recipient"("user_id", "is_deleted", "created_at");

-- CreateIndex
CREATE INDEX "notification_recipient_notification_id_is_read_idx" ON "notification_recipient"("notification_id", "is_read");

-- CreateIndex
CREATE INDEX "notification_recipient_user_id_idx" ON "notification_recipient"("user_id");

-- CreateIndex
CREATE INDEX "notification_recipient_notification_id_idx" ON "notification_recipient"("notification_id");

-- CreateIndex
CREATE INDEX "notification_recipient_is_read_idx" ON "notification_recipient"("is_read");

-- CreateIndex
CREATE INDEX "notification_recipient_is_deleted_idx" ON "notification_recipient"("is_deleted");

-- CreateIndex
CREATE UNIQUE INDEX "notification_recipient_notification_id_user_id_key" ON "notification_recipient"("notification_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_supabase_user_id_key" ON "user"("supabase_user_id");

-- CreateIndex
CREATE INDEX "user_role_is_active_idx" ON "user"("role", "is_active");

-- CreateIndex
CREATE INDEX "user_is_active_created_at_idx" ON "user"("is_active", "created_at");

-- CreateIndex
CREATE INDEX "user_email_is_active_idx" ON "user"("email", "is_active");

-- CreateIndex
CREATE INDEX "user_first_name_last_name_idx" ON "user"("first_name", "last_name");

-- CreateIndex
CREATE INDEX "user_phone_idx" ON "user"("phone");

-- AddForeignKey
ALTER TABLE "vocab" ADD CONSTRAINT "vocab_source_language_code_fkey" FOREIGN KEY ("source_language_code") REFERENCES "language"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vocab" ADD CONSTRAINT "vocab_target_language_code_fkey" FOREIGN KEY ("target_language_code") REFERENCES "language"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vocab" ADD CONSTRAINT "vocab_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vocab_trainer" ADD CONSTRAINT "vocab_trainer_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vocab_trainer_word" ADD CONSTRAINT "vocab_trainer_word_vocab_trainer_id_fkey" FOREIGN KEY ("vocab_trainer_id") REFERENCES "vocab_trainer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vocab_trainer_word" ADD CONSTRAINT "vocab_trainer_word_vocab_id_fkey" FOREIGN KEY ("vocab_id") REFERENCES "vocab"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vocab_trainer_result" ADD CONSTRAINT "vocab_trainer_result_vocab_trainer_id_fkey" FOREIGN KEY ("vocab_trainer_id") REFERENCES "vocab_trainer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "text_target" ADD CONSTRAINT "text_target_vocab_id_fkey" FOREIGN KEY ("vocab_id") REFERENCES "vocab"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "text_target" ADD CONSTRAINT "text_target_word_type_id_fkey" FOREIGN KEY ("word_type_id") REFERENCES "word_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vocab_example" ADD CONSTRAINT "vocab_example_text_target_id_fkey" FOREIGN KEY ("text_target_id") REFERENCES "text_target"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject" ADD CONSTRAINT "subject_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "text_target_subject" ADD CONSTRAINT "text_target_subject_text_target_id_fkey" FOREIGN KEY ("text_target_id") REFERENCES "text_target"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "text_target_subject" ADD CONSTRAINT "text_target_subject_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_recipient" ADD CONSTRAINT "notification_recipient_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_recipient" ADD CONSTRAINT "notification_recipient_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
