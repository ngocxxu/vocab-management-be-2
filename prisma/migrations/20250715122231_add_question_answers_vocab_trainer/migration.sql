-- AlterTable
ALTER TABLE "VocabTrainer" ADD COLUMN     "questionAnswers" JSONB[] DEFAULT ARRAY[]::JSONB[];
