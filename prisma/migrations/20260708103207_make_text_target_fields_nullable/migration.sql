-- AlterTable
ALTER TABLE "text_target" ALTER COLUMN "grammar" DROP NOT NULL,
ALTER COLUMN "explanation_source" DROP NOT NULL,
ALTER COLUMN "explanation_target" DROP NOT NULL;
