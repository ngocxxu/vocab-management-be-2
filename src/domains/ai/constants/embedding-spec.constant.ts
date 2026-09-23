/**
 * Single source of truth for the embedding model, its output dimensionality,
 * the Qdrant collection it's stored in, and the semantic search score cutoff.
 *
 * All four travel together: changing the model can change the vector space
 * (dimensions, and what a given cosine score means), so `scoreThreshold` is
 * NOT reusable across models — it must be re-measured whenever `model` changes.
 *
 * `scoreThreshold` exists because without a cutoff, Qdrant always returns the
 * top-N nearest points in scope, no matter how unrelated — a folder with only
 * "hello" in it makes "hello" the answer to every query, including "tired".
 * The 0.62 value was measured against real gemini-embedding-001 output
 * (RETRIEVAL_DOCUMENT text "word | translation", RETRIEVAL_QUERY single
 * words), not guessed: genuinely related pairs scored 0.67-0.80 (e.g.
 * "exhausted" vs "tired | mệt" = 0.7174), unrelated pairs scored 0.57-0.61
 * (e.g. "tired" vs "hello | Xin chào" = 0.5985). 0.62 sits in that gap. This
 * is a small-sample heuristic, not a calibrated bound — recheck if real usage
 * shows false negatives (a real match scoring just under 0.62) or false
 * positives (noise still getting through above it).
 *
 * To upgrade the embedding model: bump `model`, ALWAYS give `collection` a
 * new name (a new model's vectors are not comparable to the old ones — mixing
 * them in one collection silently corrupts search), bump `dimensions` if it
 * changed, and re-measure `scoreThreshold` the same way as above. See
 * docs/features/semantic-search.md for the full upgrade runbook.
 */
export const EMBEDDING_SPEC = {
    model: 'gemini-embedding-001',
    dimensions: 768,
    collection: 'vocab_embeddings',
    scoreThreshold: 0.62,
} as const;

/** Stored per-row in `vocab_embedding_state.embedding_spec` to detect a model change. */
export const EMBEDDING_SPEC_ID = `${EMBEDDING_SPEC.model}:${EMBEDDING_SPEC.dimensions}`;
