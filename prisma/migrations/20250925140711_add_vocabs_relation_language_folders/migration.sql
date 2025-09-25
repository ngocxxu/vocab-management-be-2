/*
  Warnings:

  - Added the required column `language_folder_id` to the `vocab` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "vocab" ADD COLUMN     "language_folder_id" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "vocab_language_folder_id_source_language_code_target_langua_idx" ON "vocab"("language_folder_id", "source_language_code", "target_language_code");

-- AddForeignKey
ALTER TABLE "vocab" ADD CONSTRAINT "vocab_language_folder_id_fkey" FOREIGN KEY ("language_folder_id") REFERENCES "language_folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
