-- DropForeignKey
ALTER TABLE "TextTarget" DROP CONSTRAINT "TextTarget_wordTypeId_fkey";

-- AlterTable
ALTER TABLE "TextTarget" ALTER COLUMN "wordTypeId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "TextTarget" ADD CONSTRAINT "TextTarget_wordTypeId_fkey" FOREIGN KEY ("wordTypeId") REFERENCES "WordType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
