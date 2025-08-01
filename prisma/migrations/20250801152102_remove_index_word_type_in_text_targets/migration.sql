/*
  Warnings:

  - A unique constraint covering the columns `[vocabId,textTarget]` on the table `TextTarget` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "TextTarget_vocabId_wordTypeId_key";

-- DropIndex
DROP INDEX "TextTarget_wordTypeId_textTarget_idx";

-- CreateIndex
CREATE UNIQUE INDEX "TextTarget_vocabId_textTarget_key" ON "TextTarget"("vocabId", "textTarget");
