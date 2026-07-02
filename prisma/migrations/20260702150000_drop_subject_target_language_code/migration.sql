-- Merge duplicate subjects that were only distinct by target_language_code.
-- Survivor per (user_id, LOWER(name)) is the earliest-created row.
CREATE TEMP TABLE "_subject_survivor" AS
SELECT
    "id",
    "user_id",
    FIRST_VALUE("id") OVER (
        PARTITION BY "user_id", LOWER("name")
        ORDER BY "created_at" ASC, "id" ASC
    ) AS "survivor_id"
FROM "subject";

-- Drop loser->text_target join rows that would collide with a join row the survivor already has.
DELETE FROM "text_target_subject" "tts"
USING "_subject_survivor" "ss"
WHERE "tts"."subject_id" = "ss"."id"
  AND "ss"."id" <> "ss"."survivor_id"
  AND EXISTS (
      SELECT 1 FROM "text_target_subject" "tts2"
      WHERE "tts2"."subject_id" = "ss"."survivor_id"
        AND "tts2"."text_target_id" = "tts"."text_target_id"
  );

-- Repoint remaining loser join rows onto the survivor subject.
UPDATE "text_target_subject" "tts"
SET "subject_id" = "ss"."survivor_id"
FROM "_subject_survivor" "ss"
WHERE "tts"."subject_id" = "ss"."id"
  AND "ss"."id" <> "ss"."survivor_id";

-- Delete the now-redundant loser subjects.
DELETE FROM "subject" "s"
USING "_subject_survivor" "ss"
WHERE "s"."id" = "ss"."id"
  AND "ss"."id" <> "ss"."survivor_id";

DROP TABLE "_subject_survivor";

-- Collapse per-(user, language) ordering into a single per-user sequence, oldest first.
WITH "_subject_ordered" AS (
    SELECT
        "id",
        ROW_NUMBER() OVER (PARTITION BY "user_id" ORDER BY "created_at" ASC, "id" ASC) AS "new_order"
    FROM "subject"
)
UPDATE "subject" "s"
SET "order" = "_subject_ordered"."new_order"
FROM "_subject_ordered"
WHERE "s"."id" = "_subject_ordered"."id";

-- Drop the target_language_code column and its indexes/constraints.
ALTER TABLE "subject" DROP CONSTRAINT IF EXISTS "subject_target_language_code_fkey";
DROP INDEX IF EXISTS "subject_user_id_target_lang_lower_name_key";
DROP INDEX IF EXISTS "subject_user_id_target_language_code_idx";
ALTER TABLE "subject" DROP COLUMN IF EXISTS "target_language_code";

-- Restore per-user uniqueness (case-insensitive, matching app-level dedup logic).
CREATE INDEX "subject_user_id_idx" ON "subject"("user_id");
CREATE UNIQUE INDEX "subject_user_id_lower_name_key" ON "subject"("user_id", LOWER("name"));
