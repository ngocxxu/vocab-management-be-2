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

**User**:
A person's account in Vocab. Identified internally by `users.id`, which never changes and is the only id that ownership, roles and quotas refer to. A User may have several Identities.
_Avoid_: Account (ambiguous with the login at the provider), Profile

**Identity**:
One external login (a token issuer plus the subject that issuer assigns) mapped to exactly one User. Found only by issuer + subject, never by email. A valid token whose Identity is not mapped yet is rejected as not provisioned.
_Avoid_: Login, Auth user, Supabase user

**Provisioning**:
Creating a User, together with its first Identity, the first time a verified login arrives with no mapped Identity. Happens once per login and is safe to repeat.
_Avoid_: Sign-up, Registration, Auto-create

**Provider sign-up**:
Creating a login at the identity provider (a password account on Auth0, a first Google sign-in). It creates no User: Provisioning does that on the first verified login. A password provider sign-up is refused when its email already belongs to a User.
_Avoid_: Registration, Provisioning (a different step)

**Account link**:
Attaching an Identity to a User that already exists. Never automatic and never decided by email: when a new login's email already belongs to a User, Provisioning stops. The User then links the new login themselves from a session already authenticated as that User, signing in with the new login to prove they control both. An admin can still link by hand as a fallback. The new login must have a verified email, which need not equal the User's email.
_Avoid_: Merge, Auto-link

**Sign-in method**:
What a User calls an Identity on screen ("Google", "password"). User-facing text uses "sign-in method"; code and this glossary use Identity.
_Avoid_: Login, Account (in user-facing text)
