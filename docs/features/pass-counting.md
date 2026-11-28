# Pass counting and the Classic reminder cycle (#42)

A Classic trainer is completed after T Passes. This document covers which attempts count as a Pass, how the reminders follow, and which code path runs what. The vocab words are in `GLOSSARY.md` (Pass count, Counted attempt, Fail streak, Reminder prompt, Max passes, Spacing).

## Rules

| Rule                                                                                                                                                                                                                                                                                                         | Where it is enforced                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Nothing counts while a classic INITIAL reminder is PENDING, CLAIMED, QUEUED or SENDING (reminders on or off). With reminders on, a Pass also needs either no Pass counted yet, or a classic INITIAL reminder that reached a final state (SENT, FAILED_TERMINAL or CANCELLED) after the last counted attempt. | `countsAsAttempt` (`vocab-trainer/utils/pass-rules.util.ts`), `ReminderScheduleRepository.findLatestFinalInitialAt` |
| Reminders off: an attempt still counts, at most once per 24 hours, and only when no classic INITIAL reminder is in flight.                                                                                                                                                                                   | `countsAsAttempt`, `ReminderScheduleRepository.hasInFlightInitial`                                                  |
| Reminders on, after the chain cap (30 terminal classic INITIAL reminders): no new reminder is planned, so one more Pass counts and then no Pass counts. Reminders off still count (24 hours).                                                                                                                | `VocabTrainerReminderAfterExamService.scheduleInitialTx` (cap check), `countsAsAttempt`                             |
| Only a counted PASSED attempt adds a Pass. A repeat never adds a Pass or resets progress.                                                                                                                                                                                                                    | `VocabTrainerAttemptService.applyAttemptTx`                                                                         |
| Reaching T completes the trainer: the row is removed, its reminders are cancelled, the completion bell shows the real T.                                                                                                                                                                                     | `applyAttemptTx`, `afterCommit`                                                                                     |
| Three counted FAILED attempts in a row raise the prompt (reminders on). A counted pass resets the streak.                                                                                                                                                                                                    | `nextFailStreak`, `isReminderPromptPending`                                                                         |
| Yes resets the streak. No turns reminders off. No prompt pending: the trainer comes back unchanged. FSRS is rejected.                                                                                                                                                                                        | `VocabTrainerReminderService.answerReminderPrompt`                                                                  |
| Reminders off cancels the pending ones and hides the reminder bells. Reminders on plans the next one only with a completed attempt and nothing in flight.                                                                                                                                                    | `VocabTrainerReminderService.setRemindersEnabled`                                                                   |
| Trainer update cannot change Passes, status or the last-remind time. `reminderDisabled` goes through the toggle. T cannot go below the Passes earned.                                                                                                                                                        | `VocabTrainerService.update`, `toScalarPatch`, `assertReminderSettings`                                             |
| Deleting a trainer (single or bulk, max 100 ids) cancels its open reminders and hides its bells.                                                                                                                                                                                                             | `VocabTrainerService.delete`, `VocabTrainerReminderService.onTrainerRemoved`                                        |
| A reminder email is not sent when its trainer is gone, its reminders are off (classic), or its user is inactive. The row is cancelled.                                                                                                                                                                       | `ReminderSendGuardService`, `EmailProcessor`                                                                        |
| Bells: Reminder bells last 90 days (classic and FSRS). Reminder bells are hidden on pass, reminders off, delete and completion. Grading bells are hidden on delete and completion.                                                                                                                           | `ReminderInAppNotificationService`                                                                                  |

Ranges: spacing X 2 to 30 days (default 2), max passes T 3 to 20 (default 6). The database also checks them (`vocab_trainer` CHECK constraints in migration `20261123100000_count_one_pass_per_cycle`).

## Paths

**Multiple choice (synchronous)**

```
PATCH /vocab-trainers/:id/exam
→ VocabTrainerService.submitMultipleChoice()
  → AiService.getActiveJobForTrainer()        409 if an AI job of this trainer runs
  → transaction (SERIALIZABLE, runs again on a write conflict, see Open items):
      lockAndFindForUpdate (SELECT ... FOR UPDATE on the trainer row)
      resolveCountsAsAttempt (read under the lock)
      replace results
      applyAttemptTx (Pass, streak, reminder cycle, completion)
  → mastery per word (after commit, best effort)
  → afterCommit (completion bell; completed hides all bells, passed hides reminder bells; never throws)
```

**Fill in the blank (AI job)**

```
PATCH /vocab-trainers/:id/exam
→ VocabTrainerService.submitFillInBlank()
  → AiQueueService.queueFillInBlankEvaluation()
      acquire the user's job lock
      if it joined a running job: stop (nothing is decided again)
      else decideAttempt() → { countsAsAttempt, submittedAt } stored in the job
  → Bull job → FillInBlankEvaluationProcessor
      if the trainer is gone: complete with trainerDeleted, write nothing
      if submittedAt is already on the trainer: re-send the stored results, no AI call, no write
      AI evaluation
      transaction: lock row, same as above, using the STORED countsAsAttempt
      mastery, afterCommit, emit completed, release lock
```

A retry after the commit finds the same `submittedAt` on the trainer (`lastExamSubmittedAt`) and does nothing else.

**Reminder email**

```
SchedulerPollerService → EmailProcessor.handleReminderScheduleEmail()
  → acted check (escalations)
  → ReminderSendGuardService.check()   cancel the row when the guard says no
  → EmailService.sendReminderEmail()   "Next reminder: in N days after your attempt."
  → markSentIfStillSending → bell
```

## Decisions

- **The count is decided under a lock, and stored in the AI job.** The multiple-choice path decides under the trainer row lock. The AI path decides under the user's job lock, so a second submit that joins the running job never counts again. The processor applies the stored answer. See `docs/adr/0009-count-pass-under-the-trainer-lock.md`.
- **An exam no longer turns reminders back on.** Before #42, every exam set `reminderDisabled = false`. That reset would let a user with reminders off collect Passes without the 24-hour limit, so it is removed. This changes the #16 decision Q16.
- **With reminders on, a Pass counts after a final reminder state, not only after SENT (#16 Q4, option A).** The boundary is the latest classic INITIAL reminder in SENT, FAILED_TERMINAL or CANCELLED. Each state is read by its own timestamp: `sentAt`, `completedAt`, `cancelledAt`. A SENT-only boundary would deadlock when the next reminder never sends, for example after a provider rejects the address (400, 422) or after three failed sends. Escalations are not used.
- **Nothing counts while a classic INITIAL reminder is in flight, with reminders on or off.** A reminder in SENDING used to be ignored with reminders on. A counted attempt then could open the next Pass and collide with the open row's dedupe key (see Open items). The block also covers the first Pass.
- **Reminders cancelled by a counted attempt are stamped with the attempt's submit time.** Today these are escalations only, because nothing INITIAL is in flight when a Pass counts. The check is strict (`last count < final state`), so a final state at the same instant does not count. The stamp keeps this true if that changes.
- **Turning reminders off and on: the next Pass waits for the new reminder to be SENT.** The reminder cancelled by "off" is a final state after the last count, but the in-flight block holds while the new reminder is pending. After it is SENT, one Pass counts, and a repeat is blocked by the reminder that Pass planned. Before this change, the Pass after "on" counted at once (the approved CANCELLED rule, now narrowed).
- **The fail streak counts counted attempts only.** A repeat during a pending reminder does not move it. This keeps the prompt tied to reminder cycles.
- **Completion still removes the trainer row**, as before. The completion bell is created after the commit.
- **Mastery stays best effort** and runs after the commit on both paths.
- **Older AI jobs** (queued before #42, without `countsAsAttempt` or `submittedAt`) are applied as counted, at the job time.

## Not changed

- The FSRS reminder flow (`FsrsReminderService`) keeps its own rules. The send guard only adds the user-active check for FSRS rows.
- The escalation chain, the acted check and the reconciliation jobs keep their behaviour.
- A reminder that is already SENDING when its trainer is turned off or deleted still goes out. The guard runs once, before the send (tracked as #38).

## Open items

- Cap effect, for review: after 30 terminal classic INITIAL reminders, `scheduleInitialTx` plans no new reminder. With reminders on, the next Pass counts once, then no Pass counts (no final state can follow). Only reminders off still count (24 hours). Covered by `reminder chain cap (gap a)` in `vocab-trainer.pass-counting.integration.spec.ts`.
- Fixed: `scheduleInitialTx` no longer catches the `P2002` error from the dedupe key. It writes the next INITIAL with `createMany` and `skipDuplicates`, which Prisma sends as `INSERT ... ON CONFLICT DO NOTHING` (no conflict target). A clash with an open row is skipped, and the transaction stays usable. Before this fix, the caught `P2002` aborted the transaction, and the commit then rolled back the whole attempt without an error while the response still said the Pass counted. The `dedupeKey` index is partial: it covers every row that is not CANCELLED or EXPIRED, so the skip applies to any open row with the same key.
- Retried: a write conflict (P2034, write conflict or deadlock) runs the transaction again. The three entry points run through `runSerializableWithRetry`: the multiple-choice submit, the fill-in-blank apply step (the AI call stays outside the transaction), and the reminder toggle (on). Up to three attempts in total. Any other error, or the last conflict, is rethrown and the request fails. Every value the callback uses is computed before it, so a retry changes nothing.
- Retried, raw query: `SELECT ... FOR UPDATE` is a raw query. Prisma reports its conflict as `P2010` with Postgres code `40001`, not `P2034`, so the helper also retries that case. A raw deadlock (`40P01`) is not retried.
- Isolation change: these transactions moved from READ COMMITTED to SERIALIZABLE. Their reads share one snapshot, taken at the lock statement. A submit that waits for the lock now gets a conflict and runs again, instead of reading the new state after the wait. Serializable can also abort on read-write dependencies with reminder rows, with no lock wait, so more retries are possible under load. After three failed attempts the request fails with the default 500 of the Prisma exception filter. Not measured under load.
- Retry tests: `base.repository.spec.ts` (helper), the processor and toggle unit specs (P2034 retried once), and the real-Postgres specs in `vocab-trainer.pass-counting.integration.spec.ts` and `fill-in-blank-evaluation.integration.spec.ts` (a write conflict thrown after the attempt rolls it back, and the retry applies it once).
- Tests: `vocab-trainer-reminder-after-exam.integration.spec.ts` (real Postgres: a clash is skipped and the transaction keeps working) and `vocab-trainer-reminder-after-exam.service.spec.ts` (skipDuplicates is used, P2034 propagates, the chain cap still stops planning).
- Edge (#38): a reminder that is SENDING when its trainer is turned off is not cancelled. It still goes out, and it blocks counting until it is SENT or fails.
- Staging checks listed in #42 (manual).
- Frontend work (vocab-management-fe-2): X and T inputs, the prompt, no `status` / `reminderRepeat` / `reminderLastRemind` in the update payload.
