-- Backfill: upgrade existing VocabRelatedWord rows where free_text matches a Vocab.text_source
-- Sets linked_vocab_id = matching vocab's id, clears free_text, creates bidirectional mirror row.
-- Match criteria: same user_id, language_folder_id, source_language_code, target_language_code (case-insensitive text match).

WITH upgradeable AS (
    SELECT
        rw.id           AS rw_id,
        rw.vocab_id     AS source_vocab_id,
        v_target.id     AS target_vocab_id,
        rw.is_synonym,
        rw.is_antonym,
        rw.is_related
    FROM vocab_related_word rw
    JOIN vocab v_source ON v_source.id = rw.vocab_id
    JOIN vocab v_target
        ON  LOWER(v_target.text_source)        = LOWER(rw.free_text)
        AND v_target.user_id                   = v_source.user_id
        AND v_target.language_folder_id        = v_source.language_folder_id
        AND v_target.source_language_code      = v_source.source_language_code
        AND v_target.target_language_code      = v_source.target_language_code
        AND v_target.id                       != v_source.id
    WHERE rw.free_text       IS NOT NULL
      AND rw.linked_vocab_id IS NULL
),
upgraded AS (
    UPDATE vocab_related_word rw
    SET
        free_text       = NULL,
        linked_vocab_id = u.target_vocab_id,
        updated_at      = NOW()
    FROM upgradeable u
    WHERE rw.id = u.rw_id
    RETURNING
        u.source_vocab_id,
        u.target_vocab_id,
        u.is_synonym,
        u.is_antonym,
        u.is_related
)
INSERT INTO vocab_related_word
    (id, vocab_id, linked_vocab_id, free_text, is_synonym, is_antonym, is_related, created_at, updated_at)
SELECT
    gen_random_uuid()::text,
    u.target_vocab_id,
    u.source_vocab_id,
    NULL,
    u.is_synonym,
    u.is_antonym,
    u.is_related,
    NOW(),
    NOW()
FROM upgraded u
WHERE NOT EXISTS (
    SELECT 1
    FROM   vocab_related_word existing
    WHERE  existing.vocab_id        = u.target_vocab_id
      AND  existing.linked_vocab_id = u.source_vocab_id
);
