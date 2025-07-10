/*
  Warnings:

  - You are about to drop the column `sourceLanguageId` on the `Vocab` table. All the data in the column will be lost.
  - You are about to drop the column `targetLanguageId` on the `Vocab` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[textSource,sourceLanguageCode,targetLanguageCode]` on the table `Vocab` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `sourceLanguageCode` to the `Vocab` table without a default value. This is not possible if the table is not empty.
  - Added the required column `targetLanguageCode` to the `Vocab` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Vocab" DROP CONSTRAINT "Vocab_sourceLanguageId_fkey";

-- DropForeignKey
ALTER TABLE "Vocab" DROP CONSTRAINT "Vocab_targetLanguageId_fkey";

-- DropIndex
DROP INDEX "Vocab_sourceLanguageId_idx";

-- DropIndex
DROP INDEX "Vocab_sourceLanguageId_targetLanguageId_idx";

-- DropIndex
DROP INDEX "Vocab_targetLanguageId_idx";

-- DropIndex
DROP INDEX "Vocab_textSource_sourceLanguageId_targetLanguageId_key";

-- AlterTable
ALTER TABLE "Vocab" DROP COLUMN "sourceLanguageId",
DROP COLUMN "targetLanguageId",
ADD COLUMN     "sourceLanguageCode" TEXT NOT NULL,
ADD COLUMN     "targetLanguageCode" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "Language_code_idx" ON "Language"("code");

-- CreateIndex
CREATE INDEX "Vocab_sourceLanguageCode_idx" ON "Vocab"("sourceLanguageCode");

-- CreateIndex
CREATE INDEX "Vocab_targetLanguageCode_idx" ON "Vocab"("targetLanguageCode");

-- CreateIndex
CREATE INDEX "Vocab_sourceLanguageCode_targetLanguageCode_idx" ON "Vocab"("sourceLanguageCode", "targetLanguageCode");

-- CreateIndex
CREATE UNIQUE INDEX "Vocab_textSource_sourceLanguageCode_targetLanguageCode_key" ON "Vocab"("textSource", "sourceLanguageCode", "targetLanguageCode");

-- AddForeignKey
ALTER TABLE "Vocab" ADD CONSTRAINT "Vocab_sourceLanguageCode_fkey" FOREIGN KEY ("sourceLanguageCode") REFERENCES "Language"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vocab" ADD CONSTRAINT "Vocab_targetLanguageCode_fkey" FOREIGN KEY ("targetLanguageCode") REFERENCES "Language"("code") ON DELETE CASCADE ON UPDATE CASCADE;
