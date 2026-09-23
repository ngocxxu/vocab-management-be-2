# Embedding retry has no attempt cap

`markFailed` deliberately does not store `sourceVersion`, so a failed row stays "due" forever, and its retry backoff (`retryBaseMs * 2^attempt`) is capped at `maxRetryMs` (6h) rather than the attempt count itself. Unlike `ReminderSchedule.maxAttempts` (3 tries, then give up), embedding has no cap: a permanently-failing row keeps retrying every ~6h indefinitely.

We chose this because a failed embed is a sync falling behind, not a message that expired — a `ReminderSchedule` row past `maxAttempts` is correctly abandoned (the reminder is stale by then), but a vocab that never gets embedded stays permanently unsearchable with no path back except manual intervention. The cost is a small, steady trickle of Gemini calls on any row broken for a structural reason (e.g. text the model always rejects); the alternative — capping attempts — was rejected because it silently and permanently removes a vocab from search results with no visible signal to fix it.

## Consequences

There is no automatic way to know a row is "stuck forever" versus "will recover on the next backoff window." `attempt` and `lastError` are stored and queryable (`WHERE attempt > N`), but nothing currently surfaces them — this is the retry-side counterpart to `attempt` needing an observability hook, not a hard limit.
