-- Drop the old unique constraint on name column
DROP INDEX IF EXISTS "subject_name_key";

-- Create new unique constraint on [user_id, name]
-- This allows the same subject name for different users, but prevents duplicates for the same user
CREATE UNIQUE INDEX "subject_user_id_name_key" ON "subject"("user_id", "name");

