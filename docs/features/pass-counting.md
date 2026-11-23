# Pass counting and the Classic reminder cycle (#42)

A Classic trainer is completed after T Passes. This document covers which attempts count as a Pass, how the reminders follow, and which code path runs what. The vocab words are in `GLOSSARY.md` (Pass count, Counted attempt, Fail streak, Reminder prompt, Max passes, Spacing).

## Rules

| Rule                                                                                                                                                  | Where it is enforced                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| An attempt counts unless a classic INITIAL reminder is PENDING, CLAIMED, QUEUED or SENDING. A FAILED_TERMINAL reminder does not block.                | `countsAsAttempt` (`vocab-trainer/utils/pass-rules.util.ts`), `ReminderScheduleRepository.hasInFlightInitial` |
| Reminders off: an attempt still counts, at most once per 24 hours.                                                                                    | `countsAsAttempt`                                                                                             |
| Only a counted PASSED attempt adds a Pass. A repeat never adds a Pass or resets progress.                                                             | `VocabTrainerAttemptService.applyAttemptTx`                                                                   |
| Reaching T completes the trainer: the row is removed, its reminders are cancelled, the completion bell shows the real T.                              | `applyAttemptTx`, `afterCommit`                                                                               |
| Three counted FAILED attempts in a row raise the prompt (reminders on). A counted pass resets the streak.                                             | `nextFailStreak`, `isReminderPromptPending`                                                                   |
| Yes resets the streak. No turns reminders off. No prompt pending: the trainer comes back unchanged. FSRS is rejected.                                 | `VocabTrainerReminderService.answerReminderPrompt`                                                            |
| Reminders off cancels the pending ones and hides the bells. Reminders on plans the next one only with a completed attempt and nothing in flight.      | `VocabTrainerReminderService.setRemindersEnabled`                                                             |
| Trainer update cannot change Passes, status or the last-remind time. `reminderDisabled` goes through the toggle. T cannot go below the Passes earned. | `VocabTrainerService.update`, `toScalarPatch`, `assertReminderSettings`                                       |
| Deleting a trainer (single or bulk, max 100 ids) cancels its open reminders and hides its bells.                                                      | `VocabTrainerService.delete`, `VocabTrainerReminderService.onTrainerRemoved`                                  |
| A reminder email is not sent when its trainer is gone, its reminders are off (classic), or its user is inactive. The row is cancelled.                | `ReminderSendGuardService`, `EmailProcessor`                                                                  |
| Bells: classic 90 days, FSRS 30 days. Hidden on pass, reminders off, delete, completion.                                                              | `ReminderInAppNotificationService`                                                                            |

Ranges: spacing X 2 to 30 days (default 2), max passes T 3 to 20 (default 6). The database also checks them (`vocab_trainer` CHECK constraints in migration `20261123100000_count_one_pass_per_cycle`).

## Paths

**Multiple choice (synchronous)**

```
PATCH /vocab-trainers/:id/exam
→ VocabTrainerService.submitMultipleChoice()
  → AiService.getActiveJobForTrainer()        409 if an AI job of this trainer runs
  → transaction:
      lockAndFindForUpdate (SELECT ... FOR UPDATE on the trainer row)
      resolveCountsAsAttempt (read under the lock)
      replace results
      applyAttemptTx (Pass, streak, reminder cycle, completion)
  → mastery per word (after commit, best effort)
  → afterCommit (completion bell, hide bells; never throws)
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
- **The fail streak counts counted attempts only.** A repeat during a pending reminder does not move it. This keeps the prompt tied to reminder cycles.
- **Completion still removes the trainer row**, as before. The completion bell is created after the commit.
- **Mastery stays best effort** and runs after the commit on both paths.
- **Older AI jobs** (queued before #42, without `countsAsAttempt` or `submittedAt`) are applied as counted, at the job time.

## Not changed

- The FSRS reminder flow (`FsrsReminderService`) keeps its own rules. The send guard only adds the user-active check for FSRS rows.
- The escalation chain, the acted check and the reconciliation jobs keep their behaviour.
- A reminder that is already SENDING when its trainer is turned off or deleted still goes out. The guard runs once, before the send (tracked as #38).

## Open items

- Staging checks listed in #42 (manual).
- Frontend work (vocab-management-fe-2): X and T inputs, the prompt, no `status` / `reminderRepeat` / `reminderLastRemind` in the update payload.
