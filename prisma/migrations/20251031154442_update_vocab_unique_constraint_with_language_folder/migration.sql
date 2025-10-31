-- Drop the old unique constraint (without language_folder_id)
DROP INDEX IF EXISTS "vocab_text_source_source_language_code_target_language_code_key";

-- Create new unique constraint that includes language_folder_id
-- This allows the same vocab to exist in different folders, but prevents duplicates within the same folder
CREATE UNIQUE INDEX "vocab_text_source_source_language_code_target_language_code_language_folder_id_key" 
ON "vocab"("text_source", "source_language_code", "target_language_code", "language_folder_id");

