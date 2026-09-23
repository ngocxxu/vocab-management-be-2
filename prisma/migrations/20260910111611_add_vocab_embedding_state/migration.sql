-- Semantic search: embedding state + CDC publication for Sequin.

-- Embedding state lives in its OWN table, NOT as columns on `vocab`.
--
-- WHY THIS MATTERS: `vocab` and `text_target` are inside vocab_embedding_pub.
-- Writing embedding state onto them would emit WAL -> CDC -> "vocab changed"
-- -> mark stale -> write again -> WAL, in an unbounded loop that also drains
-- the embedding API quota and grows WAL until the replication slot is dropped.
--
-- ==> NEVER add vocab_embedding_state to vocab_embedding_pub. <==
--
-- No FOREIGN KEY to vocab, deliberately: when a vocab row is deleted its state
-- row survives as a tombstone, so the worker locates orphaned Qdrant points
-- with a millisecond anti-join instead of scrolling the whole collection.
--
-- `attempt` / `next_attempt_at` named to match ReminderSchedule's retry
-- fields (same concept, same names). No `max_attempts` counterpart on
-- purpose: a failed embed is a sync that fell behind, not a message that
-- expired, so it must stay retryable forever — capped exponential backoff
-- keeps a permanently-broken row cheap instead of ever giving up on it.
CREATE TABLE "vocab_embedding_state" (
    "vocab_id"        TEXT NOT NULL,
    "source_version"  TEXT NOT NULL,
    "content_hash"    TEXT,
    "embedded_at"     TIMESTAMP(3),
    "attempt"         INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3),
    "last_error"      TEXT,
    "locked_by"       TEXT,
    "locked_at"       TIMESTAMP(3),

    CONSTRAINT "vocab_embedding_state_pkey" PRIMARY KEY ("vocab_id")
);

-- Composite, not two single-column indexes: claimDue's WHERE always filters
-- both columns together (due for retry AND not currently leased). Neither
-- column is ever queried alone anywhere in the repository.
CREATE INDEX "vocab_embedding_state_next_attempt_at_locked_at_idx" ON "vocab_embedding_state"("next_attempt_at", "locked_at");

-- CDC publication consumed by Sequin. Sequin's docs require the publication to
-- exist BEFORE the replication slot is created, or the pair is invalid and it
-- fails to connect.
--
-- Requires wal_level=logical on the server (set in the infrastructure repo's
-- postgresql.yaml); creating the publication itself does not need it, but no
-- subscriber can read from it until that setting is live.
--
-- Guarded rather than bare CREATE: publications are DATABASE-level objects and
-- survive `prisma migrate reset`, which only drops tables — so a bare CREATE
-- fails with 42710 on every reset. Guarded rather than DROP...IF EXISTS too:
-- dropping a live publication would break the replication slot Sequin is
-- reading from.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'vocab_embedding_pub') THEN
        CREATE PUBLICATION vocab_embedding_pub FOR TABLE public.vocab, public.text_target;
    END IF;
END
$$;

-- REPLICA IDENTITY stays DEFAULT for both tables. The webhook consumer ignores
-- event payloads entirely (it only signals "something changed, scan sooner"),
-- so FULL would inflate WAL volume for old-row data nothing reads.
