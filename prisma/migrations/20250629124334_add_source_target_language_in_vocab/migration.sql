/*
  Warnings:

  - A unique constraint covering the columns `[textSource,sourceLanguageId,targetLanguageId]` on the table `Vocab` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `sourceLanguageId` to the `Vocab` table without a default value. This is not possible if the table is not empty.
  - Added the required column `targetLanguageId` to the `Vocab` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Vocab" ADD COLUMN     "sourceLanguageId" TEXT NOT NULL,
ADD COLUMN     "targetLanguageId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "Vocab_sourceLanguageId_idx" ON "Vocab"("sourceLanguageId");

-- CreateIndex
CREATE INDEX "Vocab_targetLanguageId_idx" ON "Vocab"("targetLanguageId");

-- CreateIndex
CREATE INDEX "Vocab_sourceLanguageId_targetLanguageId_idx" ON "Vocab"("sourceLanguageId", "targetLanguageId");

-- CreateIndex
CREATE UNIQUE INDEX "Vocab_textSource_sourceLanguageId_targetLanguageId_key" ON "Vocab"("textSource", "sourceLanguageId", "targetLanguageId");

-- AddForeignKey
ALTER TABLE "Vocab" ADD CONSTRAINT "Vocab_sourceLanguageId_fkey" FOREIGN KEY ("sourceLanguageId") REFERENCES "Language"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vocab" ADD CONSTRAINT "Vocab_targetLanguageId_fkey" FOREIGN KEY ("targetLanguageId") REFERENCES "Language"("id") ON DELETE CASCADE ON UPDATE CASCADE;
