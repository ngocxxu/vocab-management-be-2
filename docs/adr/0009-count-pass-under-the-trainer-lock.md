# A Pass is counted under a lock on the trainer, and the AI path decides at queue time

Issue #42 (parent #16) needs one rule: an attempt adds a Pass only if it starts a new reminder cycle. Two paths can record an exam. The multiple-choice path answers in the request. The fill-in-blank path runs as an AI job with retries. Both can race with a second submit, a retry, a reminder being sent, or a trainer being deleted. This ADR records where the decision is made and how it reaches the database.

## Decision

- **Multiple choice decides under the trainer row lock.** The request takes `SELECT ... FOR UPDATE` on the `vocab_trainer` row, reads whether the attempt counts, writes results and applies the Pass in the same transaction. Two parallel submits therefore count once.
- **The AI path decides when the job is queued, under the user's job lock.** `AiQueueService` calls `decideAttempt` only after it acquires the lock. A submit that joins a running job never calls it. The answer and the submit time are stored in the Bull job.
- **The processor applies the stored answer and never decides again.** A retry is a no-op when the trainer already carries the same submit time (`lastExamSubmittedAt`). Before the AI call and again under the row lock.
- **Multiple choice returns 409 while an AI job of the same trainer runs**, so the two paths cannot interleave on one trainer.
- **Mastery and bells run after the commit and are best effort.** A failure is logged and reported, never thrown to the user.
- **Exams no longer re-enable reminders.** The count rule with reminders off (one counted attempt per 24 hours) only holds if an exam leaves the toggle alone. This replaces the #16 Q16 decision.

## Why

- A row lock is the simplest guarantee for the request path: one transaction, one reader at a time, no extra table.
- The AI job takes a different lock (the user's job lock) and runs later, so the decision must be made when the job starts, under the lock that the job itself holds. If the processor decided, a retry or a delayed job could see a different reminder state than the one the user saw.
- Storing the answer in the job means a retry cannot change its own outcome. A reminder that was sent in the meantime does not turn a counted attempt into a repeat.
- The submit time is the idempotency key, so no extra column or table is needed.

## Consequences

- The in-flight check and the final-state check are guards. Both are read under the trainer row lock, so a counted attempt cannot race a reminder change for the same trainer. The user's job lock covers the AI path. A reminder that reaches SENDING after the decision does not change the decision.
- A retry after a successful commit re-sends the stored result. It does not call the AI again.
- Jobs queued before this change have no stored answer. They count as before, at the job time.
- Integration tests cover the parallel submit (with a check that removing the lock fails it), the 409, the retry and the deleted trainer, on a real Postgres and Redis.

## Not decided here

- Whether the escalation chain should respect the same lock. It is unchanged in #42 and stays with #38.
