# Queues run on Bull, not BullMQ

The app registers its queues, producers and processors through `@nestjs/bull`, which runs **Bull 4**, and the code now imports its types from `bull` only. For a long time it also imported types, `UnrecoverableError` and `QueueEvents` from `bullmq`, which looked like a harmless typing shortcut but is not: BullMQ's `QueueEvents` reads a Redis stream that Bull never writes to, so the dead-letter listener built on it never fired (no `JobFailure` rows, no Sentry capture, no dead-letter entries), `UnrecoverableError` was ignored so rate-limited jobs were retried anyway, and `repeat: { pattern }` and `queue.drain()` were BullMQ-only calls that Bull does not have. The listener now uses Bull's own `failed` event, `job.discard()` replaces `UnrecoverableError`, and `bullmq` is gone from `package.json`.

We chose to stay on Bull rather than migrate to `@nestjs/bullmq` because the bug was the mix, not the library: a migration would touch every processor, producer and the bull-board adapter on every queue (email, push, reminders, chat, AI) to fix a problem that removing the mix already solves. The cost is staying on a library that is in maintenance mode; the alternative was rejected for this ticket only because it is a separate, larger change and not because Bull is the better long-term choice.

## Consequences

- Bull's per-job `timeout` rejects the job but cannot cancel the underlying promise, so AI calls are also wrapped in `withAiCallTimeout`; the abandoned request keeps running and its result is ignored.
- Bull emits `failed` on every attempt, so the listener treats a job as finally failed only if `job.getState()` is `failed` (retries exhausted or `discard()`ed).
- A later migration to BullMQ should go through `@nestjs/bullmq` for all queues at once. Never import from both libraries again.
