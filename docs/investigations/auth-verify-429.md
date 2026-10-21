# Repeated 429 on GET /auth/verify (2026-10-20)

Status: **mechanism found and fixed in the FE (not yet deployed); the exact trigger of the incident is unconfirmed.** The incident was not reproduced. Evidence comes from the ticket's BE logs, a live read of the prod BE log on 2026-10-21 (one User, old FE build), and the FE code. FE logs of the incident were not available.

## What the incident logs show

- 22 `ThrottlerException` on `GET /api/v1/auth/verify` between 07:00:54 and 07:01:51 UTC, then a successful Session verification at 07:01:56. That is at least 70 verifications in a minute from one User.
- `/plans` and `/vocab-trainers` returned 200 in the same window.
- `/vocab-trainers` calls are 30s apart (07:01:16, 07:01:46). The chat socket disconnects and reconnects at the same moments, and the 429s cluster right after each.

## Backend: working as designed

- Global throttler: `THROTTLE_LIMIT` (default 50) per 60s, Redis storage (`src/app/application.module.ts`).
- `/auth/verify` has no `@Throttle` override, so it uses the default.
- `GlobalAuthGuard` runs before `UserThrottlerGuard`, so the tracker is `user-<internal users.id>`.
- Counters are per handler and per user. Traffic to other endpoints does not consume the `/auth/verify` budget. Pinned by `src/shared/guards/user-throttler.guard.integration.spec.ts`.
- A 429 therefore means one User sent more than the limit of Session verifications in a minute.

## Mechanism: the FE multiplies Session verifications

Measured on prod on 2026-10-21 (one User, old FE build, about 6 minutes on the vocab-trainer pages, no 429):

- **One verify per server action.** `requireAuth()` → `verifyUser()` → `GET /auth/verify` ran before every action, followed 50-200ms later by its data call (`/vocabs?page=…`, `vocabs/bulk/get`, `srs-settings`, `language-folders/my`, `chat/unread-count`). `cache()` dedupes only within one render, so actions are never deduped. A page render with several data calls made a single verify, as expected.
- **Rate:** 14 verifications per minute on average, bursts of 10 in 14 seconds. Limit is 50.
- **One action fans out.** After `POST /vocab-trainers` the list was fetched 3 times in 1.5s, `chat/messages` twice, `chat/unread-count` 3 times, with 2 verifies 190ms apart.
- **Chat socket reconnects after every re-render.** The socket effect in `ChatProvider` had `t` (next-intl) in its dependencies. Each disconnect/connect pair followed an action that revalidates the path (e.g. `PATCH …/exam` at 07:38:21.99, disconnect 07:38:22.4, connect 07:38:23.1). The incident log has the same pairs next to the 429s. Test evidence: with `t` in the deps the socket is created 4 times over 3 renders; without it, once. Whether next-intl's `t` really changes identity after `revalidatePath` in the browser is **not confirmed**.

## Not found

- **No 30s loop in the FE code.** Every `setInterval` is a 1s UI timer; there is no polling or `refetchInterval`; `router.refresh()` only runs after a User action; `useAuth` has no callers; the axios client never calls `/auth/verify`. The prod log of 2026-10-21 shows no 30s cadence (`/plans` every ~60s). The 30s spacing in the incident log came from another User and may be coincidence.
- The incident rate (70+ per minute) was not reached by normal use in the prod sample. The fixes cut the volume; whether they are enough for that User is unknown.

## Decisions

- No change to BE limits and no dedicated higher limit for `/auth/verify`. Revisit only if one normal user flow still exceeds the limit after the FE fix.
- The fix belongs in `vocab-management-fe-2`.

## FE changes (uncommitted when this note was written)

1. `src/actions/*`: removed the bare `await requireAuth()` before data calls (kept where the User is needed and in `requireAdmin`).
2. `src/utils/server-api.ts`: on a 401 from a data call, refresh the token once and retry. Without this, expired tokens would break actions, because `verifyUser` was the only place that refreshed for actions. `/auth/*` endpoints are excluded.
3. `src/providers/ChatProvider.tsx`: `t` moved into a ref so the socket effect no longer re-runs on every render.
4. Tests: `server-api.test.ts` (refresh and retry paths), `ChatProvider.test.ts` (one socket across re-renders).

Remaining verifies after these changes: one per layout/page render, plus every `requireAdmin` action.

## How to confirm after deploy

Repeat the same session on `/vocab-trainer` with the BE log open (`kubectl -n project-vocab logs -f <vocab-be pod> | grep -E "ms 10\.|ThrottlerException|ChatBot client"`). Expect: no `/auth/verify` before data actions, and chat disconnect/connect only on page load. If 429 still appears, get that User's FE log from the same minute: the BE log alone cannot say what triggered the calls.
