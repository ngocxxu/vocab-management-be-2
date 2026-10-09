# FSRS Spaced Repetition (Vocab Trainer mode)

A Vocab Trainer has a `mode`: `CLASSIC` (the exam flow) or `FSRS` (spaced repetition with the FSRS algorithm, via `ts-fsrs`).
This document covers the `FSRS` mode: the tables, what each field means, and the rules the code follows.
The schema comments point here. Classic trainers never read or write the FSRS tables.

## Concepts

- **Trainer = one learning cycle.** An FSRS trainer holds a set of words and a deadline (optional). Starting again
  later means a new trainer (see "Cycle deadline" below), not a reset of the old one.
- **Word in a trainer.** Words are linked through `VocabTrainerWord`. Words are never added from the library automatically.
- **Card = (trainer, word, direction).** Each word gets one card per direction the trainer uses. Recognising a meaning
  and recalling a word are different memories, so they are scheduled separately. The same word in two trainers has two
  independent cards.
- **Review log.** Every rating writes one row to `VocabFsrsReviewLog`. The card is updated in the same transaction.
- **Separate from `VocabMastery`.** FSRS state lives in its own tables. Rating an FSRS card never changes
  `VocabMastery.masteryScore`, and Classic exam results never change a card. The two statistics stay apart.

## Tables

### `VocabTrainer` (FSRS columns)

Used only when `mode = FSRS`. Read through `FsrsMapper.toSettings`.

| Column                   | Type                  | Default   | Meaning                                                         |
| ------------------------ | --------------------- | --------- | --------------------------------------------------------------- |
| `mode`                   | `TrainerMode`         | `CLASSIC` | `CLASSIC` or `FSRS`. Fixed after creation.                      |
| `fsrs_desired_retention` | float                 | `0.9`     | Target probability of recall at review time, 0.70–0.97.         |
| `fsrs_maximum_interval`  | int                   | `36500`   | Longest gap between two reviews, in days (1–36500).             |
| `fsrs_new_per_day`       | int, nullable         | null      | Maximum NEW cards introduced per local day. Null = unlimited.   |
| `fsrs_directions`        | `FsrsDirection[]`     | both      | Directions that get a card. At least one. Fixed after creation. |
| `fsrs_ends_at`           | timestamptz, nullable | null      | End of the cycle (for example an exam date). Null = no end.     |

When the trainer is created, `fsrs_desired_retention`, `fsrs_directions` and `reminder_disabled` are copied from the
user's defaults (see "Settings and defaults"). The other columns come from the create request or the column default.
Later changes to the defaults do not change existing trainers. The user can edit `desired_retention`, `maximum_interval`,
`new_per_day` and `ends_at` later.

The database enforces the ranges with CHECK constraints (hand-written in the `add_fsrs` migration, Prisma cannot declare
them): retention 0.70–0.97, maximum interval 1–36500, new per day at least 1 when set, at least one direction, and on
the card `stability >= 0`, `difficulty` 0 or 1–10, and non-negative counters.

### `VocabFsrsCard`

One row per (trainer, word, direction). Unique on `(vocab_trainer_id, vocab_id, direction)`.

| Column                         | Type                  | Meaning                                                                                           |
| ------------------------------ | --------------------- | ------------------------------------------------------------------------------------------------- |
| `id`                           | cuid                  | Primary key.                                                                                      |
| `vocab_trainer_id`, `vocab_id` | string                | Composite foreign key to `VocabTrainerWord`. A card exists only while its word is in the trainer. |
| `direction`                    | `FsrsDirection`       | `SOURCE_TO_TARGET` or `TARGET_TO_SOURCE`.                                                         |
| `user_id`                      | string                | Copied from the trainer owner, so "due today" can be counted across trainers.                     |
| `state`                        | `FsrsState`           | `NEW` (never reviewed) or `REVIEW` (on a day-based schedule).                                     |
| `due`                          | timestamptz           | When the card is next due.                                                                        |
| `stability`                    | float                 | Days until the probability of recall falls to the desired retention. Higher = remembered longer.  |
| `difficulty`                   | float                 | 1 (easy) to 10 (hard). 0 until the first review.                                                  |
| `reps`                         | int                   | Total reviews.                                                                                    |
| `lapses`                       | int                   | Times the card was forgotten after it had been learned (an `AGAIN` on a `REVIEW` card).           |
| `scheduled_days`               | int                   | Interval chosen at the last review, in days.                                                      |
| `last_reviewed_at`             | timestamptz, nullable | Null until the first review.                                                                      |

### `VocabFsrsReviewLog`

One row per rating. Append-only in practice.

| Column                                | Type             | Meaning                                                                                                             |
| ------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| `answer_id`                           | string, unique   | Client-generated id of the answer. Repeating it returns the first result and does not schedule again (idempotency). |
| `user_id`                             | string           | Owner.                                                                                                              |
| `vocab_id`                            | string, nullable | The word. Set to null when the word is deleted, so the history survives.                                            |
| `vocab_trainer_id`                    | string           | The trainer. Logs are deleted with the trainer.                                                                     |
| `direction`                           | `FsrsDirection`  | Direction of the card.                                                                                              |
| `rating`                              | `FsrsRating`     | `AGAIN` (forgot), `HARD`, `GOOD`, `EASY`.                                                                           |
| `prev_state`                          | `FsrsState`      | State before this review. `NEW` means the card was introduced that day, which counts toward `fsrs_new_per_day`.     |
| `elapsed_days`                        | int              | Days since the previous review. 0 for the first one.                                                                |
| `state_after`                         | `FsrsState`      | State after the review.                                                                                             |
| `due_after`                           | timestamptz      | Next due time chosen by this review.                                                                                |
| `stability_after`, `difficulty_after` | float            | Memory values after the review.                                                                                     |
| `scheduled_days_after`                | int              | Interval chosen by this review, in days.                                                                            |
| `desired_retention_at_review`         | float            | Snapshot of the trainer's retention when the review happened. The setting can change later.                         |
| `duration_ms`                         | int, nullable    | Time from showing the card to rating it. Null if not measured.                                                      |
| `question_type`                       | `QuestionType`   | `FLIP_CARD` or `FILL_IN_THE_BLANK`.                                                                                 |
| `is_ahead`                            | bool             | The card was reviewed before it was due ("look ahead").                                                             |
| `reviewed_at`                         | timestamptz      | Server time of the review.                                                                                          |

## Rules

### Scheduling

- **No short-term steps.** Learning steps are disabled in `ts-fsrs`. A card is always `NEW` or `REVIEW`, and every
  rating (including `AGAIN`) schedules a day-based interval. A forgotten card comes back on the next day.
- **Fuzz is on.** The library randomises intervals a little, so cards do not all come back on the same day.
- **Interval cap.** The library can return an interval above `fsrs_maximum_interval`. The service caps it, so the
  configured maximum is always respected.
- **Recall probability** (`retrievability`) is computed from `stability` and the time since the last review. It is 0 for a NEW card.

### Ratings and typed answers

- Each rating button shows the next interval before the user chooses.
- For a `FLIP_CARD` question the user reveals the answer and rates it.
- For a `FILL_IN_THE_BLANK` question the user types the answer. The check compares it with every accepted answer, with no AI:
    - exact match (ignoring case, extra spaces and edge punctuation) suggests `GOOD`;
    - a typo, or a match only after removing diacritics, suggests `HARD`. The typo tolerance grows with the word:
      up to 3 characters none (only the diacritics rule applies), 4–7 characters one edit, longer words two edits;
    - anything else, and an empty answer ("I don't know"), suggests `AGAIN`.
      The suggestion only preselects a button. The user's click is the rating that is recorded.
- Reviewing sends an `answerId`. Sending the same `answerId` again returns the first result (`isDuplicate: true`). Using an
  `answerId` for another card returns `409 AnswerIdReused`.

### What is due

- The review day starts at **04:00 local time**. A card studied at 01:00 still counts for the previous day.
- The local timezone comes from the user's Config (`srs.timezone`). If it is missing or invalid, `Asia/Ho_Chi_Minh` is used.
- **Overdue** = `due` before the start of the review day. **Due today** = `due` inside the review day.
- **New** cards are counted up to the remaining daily quota: `fsrs_new_per_day` minus the NEW cards introduced today
  (review logs with `prev_state = NEW` since the day started). Unused quota does not carry over to the next day.

### Review session

- A session is a **fixed list** of cards, chosen when it starts. Its size is chosen by the user (default 20) and is not stored.
- Order: due cards first, lowest recall probability first, then new cards in the order the words were added.
  Cards of the same word are kept apart when other cards are left.
- **Look ahead** lets the user review cards due in the next days (`ahead` parameter). Their answers count as `is_ahead = true`.
- A failed session can be retried in the UI only. That retry round is not recorded and does not change the schedule.

### Cycle deadline (`fsrs_ends_at`)

- The longest interval shrinks as the deadline gets close, so every card is seen again before it. Each card gets a stable
  spread of 0 to 2 days before the (deadline minus 1 day), so cards do not all land on the same day.
- The cap never goes below 1 day.
- **Ended** is derived, not stored: `fsrs_ends_at <= now`. An ended trainer has no due counts, no session, no reminders.
  Its data is kept.
- A trainer without a deadline never ends.
- **Extend** changes `fsrs_ends_at` on the same trainer. **New cycle** clones the trainer (same words, directions and
  settings, new cards as NEW, optional new deadline). The old trainer and its logs stay as they are.

### Stats and labels

- **Mastered:** card is `REVIEW`, `stability >= 180` days, and none of its last 3 reviews was an `AGAIN` on a `REVIEW` card.
- **Leech:** `lapses >= 8`.
- The heatmap counts review logs from both modes. Mastery averages stay Classic only.

### Removing words

- Removing a word from a trainer deletes its cards (composite foreign key, cascade). Its logs are kept.
- Removing it on purpose uses `DELETE :id/vocabs/:vocabId` (see the API table). It does the same thing.
- Adding the word again creates new NEW cards. The old logs are not used to rebuild a schedule.
- A vocab that is still in a trainer cannot be deleted. The database foreign key (`NO ACTION`, deferred) blocks it.
  Mapping that error to a friendly conflict response is still open (ticket 13).

### Settings and defaults

Order of precedence when a trainer is created:

1. values sent in the create request,
2. the user's defaults (`srs.defaults` in Config, edited on `GET/PUT /srs-settings`),
3. system defaults (`SYSTEM_SRS_DEFAULTS`: retention 0.9, both directions, flip card, reminders on).

The backend copies three values this way: `fsrs_desired_retention`, `fsrs_directions` and `reminder_disabled`
(the inverse of the default `reminderEnabled`). The default question type is only a prefill for the create form, so the
create request still has to send `questionType`. `fsrs_maximum_interval` and `fsrs_new_per_day` have no user default:
they start at 36500 days and unlimited.

After creation the trainer keeps its own copy. `mode` and `fsrs_directions` cannot be changed.

The timezone is a separate Config value (`srs.timezone`) saved with the same endpoint.

### Enrollment and guards

- An FSRS trainer accepts only `FLIP_CARD` and `FILL_IN_THE_BLANK` questions.
- FSRS settings on a Classic trainer are rejected.
- Cards are created in the same transaction as the trainer, for each word and each direction.
- A word without a translation cannot have a card. It is skipped and returned in `fsrsSkippedVocabIds`.
- Adding words to an existing trainer creates only the missing cards. Existing cards are untouched.
- The Classic exam endpoints refuse an FSRS trainer, so the 6-pass auto-delete never applies to it.

## API

All routes are under `/vocab-trainers`.

| Route                                          | Purpose                                                                                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET :id/review-queue?limit&ahead`             | One fixed session list plus the counts around it. `limit` is the session size, `ahead` looks ahead in days.                                             |
| `GET :id/review-summary`                       | Overdue, due today, new available, mastered, leech, ended, deadline.                                                                                    |
| `GET :id/review-stats`                         | Cards by state and direction, forecast, true retention, stability.                                                                                      |
| `POST :id/review-answer`                       | Records one rating. `409 CycleEnded` once the cycle is over, `409 AnswerIdReused` for an `answerId` used by another card.                               |
| `POST :id/review-check`                        | Compares a typed answer and suggests a rating. Records nothing.                                                                                         |
| `PATCH :id`                                    | Edits the settings that stay editable (retention, maximum interval, new per day, deadline).                                                             |
| `POST :id/clone`                               | Starts a new cycle from an ended or active FSRS trainer.                                                                                                |
| `DELETE :id/vocabs/:vocabId`                   | Removes one word from the trainer. Its FSRS cards are deleted, its review logs are kept. 404 if the trainer is not the user's or the word is not in it. |
| `GET /vocabs/conflict/by-trainer?vocabIds=a,b` | For each word of the user, the trainers that still hold it (empty when free). Used by the page that resolves a blocked delete.                          |
| `GET/PUT /srs-settings`                        | The user's defaults and timezone.                                                                                                                       |

## Reminders

An FSRS trainer has one pending reminder at a time, planned for 09:00 local time on the next day with something to review
(`FsrsReminderService`). The email counts what is due when it is sent and is skipped when both numbers are 0. The reminder
stops after 3 emails in a row without a review, and is cancelled when the cycle ends or the trainer is deleted.
Classic trainers keep their existing reminder flow.

## Related code

- `src/domains/vocab/services/fsrs.service.ts`: the only file that calls `ts-fsrs`.
- `src/domains/vocab/services/fsrs-review.service.ts`: records one rating, atomically, once per `answerId`.
- `src/domains/vocab/services/fsrs-session.service.ts`: queue, summary, typed-answer check.
- `src/domains/vocab/repositories/fsrs.repository.ts`: queries, mastered and leech definitions.
- `src/domains/vocab/utils/fsrs-local-day.util.ts`: the 04:00 day boundary and timezone.
- `src/domains/vocab-trainer/utils/fsrs-trainer-rules.ts`: which fields are valid for which mode.
- `src/domains/reminder/services/fsrs-reminder.service.ts`: FSRS reminder scheduling.
