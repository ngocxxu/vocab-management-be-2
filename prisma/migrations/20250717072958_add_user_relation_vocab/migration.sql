-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'STAFF', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('VOCAB', 'VOCAB_TRAINER', 'VOCAB_SUBJECT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "NotificationAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'MULTI_CREATE', 'MULTI_DELETE');

-- CreateEnum
CREATE TYPE "PriorityLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "TrainerStatus" AS ENUM ('PENDING', 'IN_PROCESS', 'COMPLETED', 'CANCELLED', 'FAILED', 'PASSED');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('MULTIPLE_CHOICE', 'FILL_IN_THE_BLANK', 'MATCHING', 'TRUE_OR_FALSE', 'SHORT_ANSWER');

-- CreateTable
CREATE TABLE "Vocab" (
    "id" TEXT NOT NULL,
    "textSource" TEXT NOT NULL,
    "sourceLanguageCode" TEXT NOT NULL,
    "targetLanguageCode" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vocab_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Language" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Language_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VocabTrainer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "TrainerStatus" NOT NULL,
    "countTime" INTEGER NOT NULL DEFAULT 0,
    "setCountTime" INTEGER NOT NULL DEFAULT 0,
    "reminderTime" INTEGER NOT NULL DEFAULT 0,
    "reminderDisabled" BOOLEAN NOT NULL DEFAULT false,
    "reminderRepeat" INTEGER NOT NULL DEFAULT 2,
    "reminderLastRemind" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "questionType" "QuestionType" NOT NULL DEFAULT 'MULTIPLE_CHOICE',
    "questionAnswers" JSONB[] DEFAULT ARRAY[]::JSONB[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "VocabTrainer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VocabTrainerWord" (
    "id" TEXT NOT NULL,
    "vocabTrainerId" TEXT NOT NULL,
    "vocabId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VocabTrainerWord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VocabTrainerResult" (
    "id" TEXT NOT NULL,
    "vocabTrainerId" TEXT NOT NULL,
    "status" "TrainerStatus" NOT NULL,
    "userSelected" TEXT NOT NULL,
    "systemSelected" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VocabTrainerResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TextTarget" (
    "id" TEXT NOT NULL,
    "vocabId" TEXT NOT NULL,
    "wordTypeId" TEXT NOT NULL,
    "textTarget" TEXT NOT NULL,
    "grammar" TEXT NOT NULL,
    "explanationSource" TEXT NOT NULL,
    "explanationTarget" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TextTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VocabExample" (
    "id" TEXT NOT NULL,
    "textTargetId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VocabExample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WordType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WordType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subject" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TextTargetSubject" (
    "id" TEXT NOT NULL,
    "textTargetId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TextTargetSubject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "action" "NotificationAction" NOT NULL,
    "priority" "PriorityLevel" NOT NULL,
    "data" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationRecipient" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "avatar" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'CUSTOMER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "supabaseUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Vocab_textSource_idx" ON "Vocab"("textSource");

-- CreateIndex
CREATE INDEX "Vocab_createdAt_idx" ON "Vocab"("createdAt");

-- CreateIndex
CREATE INDEX "Vocab_updatedAt_idx" ON "Vocab"("updatedAt");

-- CreateIndex
CREATE INDEX "Vocab_sourceLanguageCode_idx" ON "Vocab"("sourceLanguageCode");

-- CreateIndex
CREATE INDEX "Vocab_targetLanguageCode_idx" ON "Vocab"("targetLanguageCode");

-- CreateIndex
CREATE INDEX "Vocab_sourceLanguageCode_targetLanguageCode_idx" ON "Vocab"("sourceLanguageCode", "targetLanguageCode");

-- CreateIndex
CREATE UNIQUE INDEX "Vocab_textSource_sourceLanguageCode_targetLanguageCode_key" ON "Vocab"("textSource", "sourceLanguageCode", "targetLanguageCode");

-- CreateIndex
CREATE UNIQUE INDEX "Language_code_key" ON "Language"("code");

-- CreateIndex
CREATE INDEX "Language_name_idx" ON "Language"("name");

-- CreateIndex
CREATE INDEX "Language_code_idx" ON "Language"("code");

-- CreateIndex
CREATE INDEX "VocabTrainer_status_idx" ON "VocabTrainer"("status");

-- CreateIndex
CREATE INDEX "VocabTrainer_status_createdAt_idx" ON "VocabTrainer"("status", "createdAt");

-- CreateIndex
CREATE INDEX "VocabTrainer_reminderDisabled_reminderLastRemind_idx" ON "VocabTrainer"("reminderDisabled", "reminderLastRemind");

-- CreateIndex
CREATE INDEX "VocabTrainer_createdAt_idx" ON "VocabTrainer"("createdAt");

-- CreateIndex
CREATE INDEX "VocabTrainer_name_idx" ON "VocabTrainer"("name");

-- CreateIndex
CREATE INDEX "VocabTrainerWord_vocabTrainerId_idx" ON "VocabTrainerWord"("vocabTrainerId");

-- CreateIndex
CREATE INDEX "VocabTrainerWord_vocabId_idx" ON "VocabTrainerWord"("vocabId");

-- CreateIndex
CREATE INDEX "VocabTrainerWord_vocabTrainerId_createdAt_idx" ON "VocabTrainerWord"("vocabTrainerId", "createdAt");

-- CreateIndex
CREATE INDEX "VocabTrainerWord_createdAt_idx" ON "VocabTrainerWord"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "VocabTrainerWord_vocabTrainerId_vocabId_key" ON "VocabTrainerWord"("vocabTrainerId", "vocabId");

-- CreateIndex
CREATE INDEX "VocabTrainerResult_vocabTrainerId_idx" ON "VocabTrainerResult"("vocabTrainerId");

-- CreateIndex
CREATE INDEX "VocabTrainerResult_vocabTrainerId_status_idx" ON "VocabTrainerResult"("vocabTrainerId", "status");

-- CreateIndex
CREATE INDEX "VocabTrainerResult_vocabTrainerId_createdAt_idx" ON "VocabTrainerResult"("vocabTrainerId", "createdAt");

-- CreateIndex
CREATE INDEX "VocabTrainerResult_status_idx" ON "VocabTrainerResult"("status");

-- CreateIndex
CREATE INDEX "VocabTrainerResult_createdAt_idx" ON "VocabTrainerResult"("createdAt");

-- CreateIndex
CREATE INDEX "TextTarget_vocabId_idx" ON "TextTarget"("vocabId");

-- CreateIndex
CREATE INDEX "TextTarget_wordTypeId_idx" ON "TextTarget"("wordTypeId");

-- CreateIndex
CREATE INDEX "TextTarget_textTarget_idx" ON "TextTarget"("textTarget");

-- CreateIndex
CREATE INDEX "TextTarget_wordTypeId_textTarget_idx" ON "TextTarget"("wordTypeId", "textTarget");

-- CreateIndex
CREATE INDEX "TextTarget_createdAt_idx" ON "TextTarget"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TextTarget_vocabId_wordTypeId_key" ON "TextTarget"("vocabId", "wordTypeId");

-- CreateIndex
CREATE INDEX "VocabExample_textTargetId_idx" ON "VocabExample"("textTargetId");

-- CreateIndex
CREATE INDEX "VocabExample_textTargetId_createdAt_idx" ON "VocabExample"("textTargetId", "createdAt");

-- CreateIndex
CREATE INDEX "VocabExample_source_idx" ON "VocabExample"("source");

-- CreateIndex
CREATE INDEX "VocabExample_target_idx" ON "VocabExample"("target");

-- CreateIndex
CREATE UNIQUE INDEX "WordType_name_key" ON "WordType"("name");

-- CreateIndex
CREATE INDEX "WordType_name_idx" ON "WordType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_name_key" ON "Subject"("name");

-- CreateIndex
CREATE INDEX "Subject_order_idx" ON "Subject"("order");

-- CreateIndex
CREATE INDEX "Subject_name_idx" ON "Subject"("name");

-- CreateIndex
CREATE INDEX "TextTargetSubject_textTargetId_idx" ON "TextTargetSubject"("textTargetId");

-- CreateIndex
CREATE INDEX "TextTargetSubject_subjectId_idx" ON "TextTargetSubject"("subjectId");

-- CreateIndex
CREATE INDEX "TextTargetSubject_subjectId_textTargetId_idx" ON "TextTargetSubject"("subjectId", "textTargetId");

-- CreateIndex
CREATE UNIQUE INDEX "TextTargetSubject_textTargetId_subjectId_key" ON "TextTargetSubject"("textTargetId", "subjectId");

-- CreateIndex
CREATE INDEX "Notification_type_isActive_idx" ON "Notification"("type", "isActive");

-- CreateIndex
CREATE INDEX "Notification_priority_isActive_idx" ON "Notification"("priority", "isActive");

-- CreateIndex
CREATE INDEX "Notification_isActive_expiresAt_idx" ON "Notification"("isActive", "expiresAt");

-- CreateIndex
CREATE INDEX "Notification_isActive_createdAt_idx" ON "Notification"("isActive", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE INDEX "NotificationRecipient_userId_isRead_isDeleted_idx" ON "NotificationRecipient"("userId", "isRead", "isDeleted");

-- CreateIndex
CREATE INDEX "NotificationRecipient_userId_isDeleted_createdAt_idx" ON "NotificationRecipient"("userId", "isDeleted", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationRecipient_notificationId_isRead_idx" ON "NotificationRecipient"("notificationId", "isRead");

-- CreateIndex
CREATE INDEX "NotificationRecipient_userId_idx" ON "NotificationRecipient"("userId");

-- CreateIndex
CREATE INDEX "NotificationRecipient_notificationId_idx" ON "NotificationRecipient"("notificationId");

-- CreateIndex
CREATE INDEX "NotificationRecipient_isRead_idx" ON "NotificationRecipient"("isRead");

-- CreateIndex
CREATE INDEX "NotificationRecipient_isDeleted_idx" ON "NotificationRecipient"("isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationRecipient_notificationId_userId_key" ON "NotificationRecipient"("notificationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_supabaseUserId_key" ON "User"("supabaseUserId");

-- CreateIndex
CREATE INDEX "User_role_isActive_idx" ON "User"("role", "isActive");

-- CreateIndex
CREATE INDEX "User_isActive_createdAt_idx" ON "User"("isActive", "createdAt");

-- CreateIndex
CREATE INDEX "User_email_isActive_idx" ON "User"("email", "isActive");

-- CreateIndex
CREATE INDEX "User_firstName_lastName_idx" ON "User"("firstName", "lastName");

-- CreateIndex
CREATE INDEX "User_phone_idx" ON "User"("phone");

-- AddForeignKey
ALTER TABLE "Vocab" ADD CONSTRAINT "Vocab_sourceLanguageCode_fkey" FOREIGN KEY ("sourceLanguageCode") REFERENCES "Language"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vocab" ADD CONSTRAINT "Vocab_targetLanguageCode_fkey" FOREIGN KEY ("targetLanguageCode") REFERENCES "Language"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vocab" ADD CONSTRAINT "Vocab_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VocabTrainer" ADD CONSTRAINT "VocabTrainer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VocabTrainerWord" ADD CONSTRAINT "VocabTrainerWord_vocabTrainerId_fkey" FOREIGN KEY ("vocabTrainerId") REFERENCES "VocabTrainer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VocabTrainerWord" ADD CONSTRAINT "VocabTrainerWord_vocabId_fkey" FOREIGN KEY ("vocabId") REFERENCES "Vocab"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VocabTrainerResult" ADD CONSTRAINT "VocabTrainerResult_vocabTrainerId_fkey" FOREIGN KEY ("vocabTrainerId") REFERENCES "VocabTrainer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TextTarget" ADD CONSTRAINT "TextTarget_vocabId_fkey" FOREIGN KEY ("vocabId") REFERENCES "Vocab"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TextTarget" ADD CONSTRAINT "TextTarget_wordTypeId_fkey" FOREIGN KEY ("wordTypeId") REFERENCES "WordType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VocabExample" ADD CONSTRAINT "VocabExample_textTargetId_fkey" FOREIGN KEY ("textTargetId") REFERENCES "TextTarget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TextTargetSubject" ADD CONSTRAINT "TextTargetSubject_textTargetId_fkey" FOREIGN KEY ("textTargetId") REFERENCES "TextTarget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TextTargetSubject" ADD CONSTRAINT "TextTargetSubject_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRecipient" ADD CONSTRAINT "NotificationRecipient_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRecipient" ADD CONSTRAINT "NotificationRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
