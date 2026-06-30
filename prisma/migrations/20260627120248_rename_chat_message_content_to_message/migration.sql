/*
  Warnings:

  - You are about to drop the column `content` on the `chat_messages` table. All the data in the column will be lost.
  - Added the required column `message` to the `chat_messages` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "chat_messages" DROP COLUMN "content",
ADD COLUMN     "message" TEXT NOT NULL;
