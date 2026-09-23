# Vocab Management

Backend for a vocabulary-learning app: vocab storage, mastery tracking, reminders, and cross-language semantic search.

## Language

**Orphan state**:
A `VocabEmbeddingState` row whose `Vocab` has been deleted. Found by anti-join; the worker uses it to know which Qdrant points to delete.
_Avoid_: Drift, dangling state

**Orphan point**:
A Qdrant point whose corresponding `VocabEmbeddingState` row is gone (state deleted without the Qdrant delete landing). Rare full-drift case, not yet reconciled automatically.
_Avoid_: Drift, dangling point

**Stale state**:
A `VocabEmbeddingState` whose stored `sourceVersion` no longer matches the vocab's current source data (edited textSource, or a textTarget added/edited/deleted). Detected cheaply in SQL; does not by itself mean the embedding is wrong.
_Avoid_: Dirty, outdated, drift

**Stale embedding**:
A stale state where re-checking also shows the `contentHash` (the actual text sent to the embedding model) has changed — the Qdrant vector is genuinely out of date and must be re-embedded via Gemini. A stale state is not always a stale embedding (e.g. editing `grammar` alone leaves the embedded text, and its hash, unchanged).
_Avoid_: Dirty, outdated, drift

**Lease**:
Temporary, time-limited ownership one worker holds over a `VocabEmbeddingState` row while processing it, so a slow embedding call survives past the Postgres transaction that claimed it (a row lock ends at COMMIT; a lease is ordinary data — `lockedBy`/`lockedAt` — that outlives it). Expires on its own after a fixed window, so a crashed worker's rows become claimable again without manual cleanup.
_Avoid_: Lock (that means a real Postgres row lock, a different thing)

**Candidate**:
A stale state selected by `claimDue`'s read-only scan, before the lease is confirmed. Provisional — another worker's concurrent UPDATE may win the row first, so a candidate is not yet guaranteed to belong to this worker.
_Avoid_: Claimed vocab (that means the row after the lease succeeded)

**Semantic search**:
The primary search: embeds the query with Gemini and ranks vocabs by vector similarity in Qdrant. Cross-language by design.
_Avoid_: Search (too generic — always say which kind)

**Substring fallback**:
The degraded search path used when the Gemini or Qdrant circuit breaker is open: a plain substring match against Postgres. Lower quality, but keeps search working during an outage.
_Avoid_: Search, backup search
