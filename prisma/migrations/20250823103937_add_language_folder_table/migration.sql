-- CreateTable
CREATE TABLE "language_folder" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "folder_color" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,
    "source_language_code" TEXT NOT NULL,
    "target_language_code" TEXT NOT NULL,

    CONSTRAINT "language_folder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "language_folder_name_idx" ON "language_folder"("name");

-- AddForeignKey
ALTER TABLE "language_folder" ADD CONSTRAINT "language_folder_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "language_folder" ADD CONSTRAINT "language_folder_source_language_code_fkey" FOREIGN KEY ("source_language_code") REFERENCES "language"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "language_folder" ADD CONSTRAINT "language_folder_target_language_code_fkey" FOREIGN KEY ("target_language_code") REFERENCES "language"("code") ON DELETE CASCADE ON UPDATE CASCADE;
