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

**Session verification**:
The `GET /auth/verify` round-trip a client makes to learn which User the presented token belongs to. Distinct from the token validation the global guard runs on every authenticated request: that one decides whether a request may proceed, this one returns the User.
_Avoid_: Token verification, Auth check, Verify (too generic: say which one)

**Exam job**:
A background run for one vocab trainer's exam: either generating its questions or grading a submission. A User has at most one Exam job in flight at a time. Starting a second for the same trainer and kind re-attaches to the running one; starting any other is refused.
_Avoid_: Task, AI job, Lock (that means a real Postgres row lock)

**Terminal status**:
`completed` or `failed`: the final outcome of an Exam job. Once an Exam job has reached it, nothing about that job changes. A failed attempt that will be retried is not terminal, so the client keeps waiting.
_Avoid_: Done, Finished, Error state

**Job status**:
What a client can ask for an Exam job after missing its live progress events: `evaluating` or `generating` while in flight, a Terminal status, or `unknown` when the job has expired or belongs to someone else.
_Avoid_: Job state (Bull's own state names are not part of this language)

**FSRS trainer**:
A vocab trainer that schedules each word by how well it is remembered, instead of asking its words in one fixed pass. Not a Classic trainer.
_Avoid_: Space repetition trainer, SRS trainer (in code and docs: say FSRS)

**Card**:
One word asked in one Direction inside an FSRS trainer. It is the unit that is scheduled, reviewed and counted. A "question" in a ticket about an FSRS trainer means a Card.
_Avoid_: Question (that is the Classic trainer and the exam word)

**Direction**:
How a Card is asked. Recognise: the source text is shown and the target is the answer. Recall: the target is shown and the source is the answer. Both: a Card per Direction, so a word has two. Random: one Card per word, asked in Recognise or Recall at random.
_Avoid_: Mode (that means Classic or FSRS), Type

**Shown direction**:
The Direction a Card is actually asked in right now. For a Recognise or Recall Card it is the Card's own Direction. For a Random Card it is picked at random and stays the same until the Card is answered.
_Avoid_: Current direction, Resolved direction

**Reminder**:
A message that tells a User a vocab trainer is due for practice. Tickets call it a "test reminder". Every Reminder is sent by email and also shows in the notification bell. A Classic trainer sends an initial Reminder and then a few escalations if the User does not act; an FSRS trainer sends one a day while cards are due.
_Avoid_: Alert, Test reminder (in code and docs: say Reminder)

**Reminder schedule**:
One planned Reminder for one trainer, due at a set time. It decides whether the Reminder is sent at all: cancelling it (trainer deleted, reminders turned off, the User already practised) means nothing is sent, by email or in the bell.
_Avoid_: Reminder job, Email job (queue jobs are not part of this language)

**Bell notification**:
The in-app message in the notification bell. A Reminder creates its Bell notification only after the email went out, so the bell never shows a Reminder that was not sent.
_Avoid_: In-app reminder, Push (that means a phone push message)

**MCP access**:
Whether a User may use the public MCP endpoint from an outside AI app. A User has it only when their plan includes it and an admin has not switched it off for them. The plan is the entitlement; the admin switch can only take it away, never grant it.
_Avoid_: MCP permission, MCP enabled (that means the server-wide switch)

**Plan benefit**:
A line in a plan's feature list that tells Users what the plan gives them. It describes the plan; it does not turn anything on by itself.
_Avoid_: Feature flag, Entitlement (the entitlement is what the system enforces; the benefit is the text)
