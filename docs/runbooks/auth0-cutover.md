# Auth0 cutover runbook

Moves the Vocab API from Supabase Auth to Auth0. The API accepts both token kinds during the window (`combined` strategy: the token's `iss` picks the verifier, Auth0 tokens never fall back to Supabase), so the backend ships first and the frontend flips when ready. Do this **once per environment**, staging first. The staging rehearsal (including the rollback) must pass before production.

Related: [linking password users](./auth0-password-user-linking.md), [ADR 0003](../adr/0003-identity-table-keyed-by-issuer-subject.md), [`src/auth/MIGRATION.md`](../../src/auth/MIGRATION.md).

Issuers: dev `https://vocab-development.jp.auth0.com/` (tenant domain, with trailing slash; no custom domain, see "Issuer change").

## 0. Preconditions (human)

- Auth0 tenant for the environment with: the API (audience = `AUTH0_AUDIENCE`), the SPA application (Authorization Code + PKCE), the Google social connection, the Database connection, and a post-login Action adding the namespaced claims `<ns>email`, `<ns>email_verified` and optionally `<ns>given_name`, `<ns>family_name`, `<ns>picture` to the **access token**.
- A machine-to-machine application authorised for the Management API with scope `delete:users` only (used by admin delete; `AUTH0_M2M_CLIENT_ID` / `AUTH0_M2M_CLIENT_SECRET`).
- Secrets set for the environment: `AUTH0_ISSUER`, `AUTH0_AUDIENCE`, `AUTH0_CLAIM_NAMESPACE`, `AUTH0_M2M_*`. Leave `AUTH0_ISSUER` empty until step 3, so the deploy in step 3 is the switch.
- The frontend release is built and ready to deploy (it must call `POST /auth/sync` after login).
- `DATABASE_URL` for the script runs points at the **same** environment as `AUTH0_ISSUER` (both scripts print what they target; check it).

## 1. Back up

```bash
pg_dump "$DATABASE_URL" --no-owner -Fc -f vocab-pre-auth0-$(date +%Y%m%d).dump
```

Keep it until step 8 is done. The only schema change is the additive `user_identity` table, so rollback never needs a restore (see step 7).

## 2. Seed existing Google users

Reads Supabase's Google identities and maps each to `google-oauth2|<id>` under the Auth0 issuer. Dry run first, read the unmapped list, then write. Re-runs are no-ops.

```bash
pnpm auth0:seed-identities            # dry run: counts + unmapped users, writes nothing
pnpm auth0:seed-identities --write
```

Needs `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `AUTH0_ISSUER`, `DATABASE_URL` in the shell. Expected: mapped count equals the number of Supabase Google identities; every unmapped user is explained (password-only users go to the next step).

Password users (a few): follow [auth0-password-user-linking.md](./auth0-password-user-linking.md). Their Auth0 login can be created now; they link after the app is on Auth0, so schedule it after step 4.

## 3. Deploy the backend with both token kinds accepted

Set `AUTH0_ISSUER` (plus the other `AUTH0_*`) and deploy the build containing the Auth0 verifier. Check:

- Existing Supabase sessions keep working (no one is logged out).
- Log line `supabase_token_accepted` appears (see "Monitoring").
- A real Auth0 access token (Auth0 dashboard, API, Test tab) on `GET /auth/verify` returns 401 `identity_not_provisioned` for an unmapped login and 200 for a seeded Google user.

## 4. Flip the frontend

Deploy the FE release in one go: sign-up and sign-in move to Auth0 Universal Login, Supabase sign-ups stop. New users get created by `POST /auth/sync` on first login.

Then link the password users (their first login returned 409 `account_link_required`).

## 5. Re-seed for the gap

Anyone who signed up on Supabase between step 2 and step 4 has no Identity yet:

```bash
pnpm auth0:seed-identities            # review
pnpm auth0:seed-identities --write
```

## 6. Monitor Supabase-token traffic

Every accepted Supabase token logs one line from `AuthTokenService`:

```
supabase_token_accepted user=<supabase user id>
```

Filter: `supabase_token_accepted` over the last 24h, grouped by `user`. The count is how many Supabase-token requests the API still serves; the distinct users are who still has the old FE. (Production logs are JSON via Winston: filter on the `message` field containing that text.) Rejected Auth0 tokens log `Auth0 token rejected: <reason>`; a burst of these after step 4 means a misconfigured audience, issuer or Action.

Supabase auth removal ([#35](https://github.com/ngocxxu/vocab-management-be-2/issues/35)) is allowed after **14 consecutive days with zero** `supabase_token_accepted` lines and the FE release live.

## 7. Rollback

Before the FE flip is trivially safe; after it:

1. Redeploy the previous FE release (Supabase login). The backend stays as is: it still accepts Supabase tokens, and `user_identity` rows are inert for them. No data change, no restore.
2. If the backend itself must go back, deploy the previous backend build; the extra table is ignored.

**Accepted limitation:** users created through Auth0 during the window (new Auth0-only sign-ups) have no Supabase account. After a rollback they cannot sign in (their email is unique, so they cannot re-register on Supabase either), and there is no reverse sync. Their data stays intact; once the cutover is retried they sign in again. If that matters, fix individually by creating the Supabase user and setting `user.supabase_user_id`.

## 8. Issuer change

If the Auth0 domain ever changes, rewrite the stored issuer in one statement, then set the new `AUTH0_ISSUER` and redeploy (do both inside one maintenance window; between them every Auth0 login returns `identity_not_provisioned`):

```sql
update user_identity
set issuer = 'https://<new-domain>/'
where issuer = 'https://<old-domain>/';
```

## Rehearsal record (staging)

Copy this block into [#34](https://github.com/ngocxxu/vocab-management-be-2/issues/34) when done.

- [ ] Backup taken and restorable
- [ ] Seed dry run: mapped = Supabase Google identities; unmapped list reviewed
- [ ] Seed write, then re-run is a no-op
- [ ] Deploy with `AUTH0_ISSUER` set: Supabase session still works, Auth0 Google user resolves to the original account and its vocabulary
- [ ] FE flipped; new user created via `/auth/sync`
- [ ] Password user linked (409, then link, then same account)
- [ ] Re-seed after the gap
- [ ] `supabase_token_accepted` filter returns the expected lines (non-zero before the flip, zero after FE users refresh)
- [ ] Rollback: FE flipped back, Supabase login works, no data changes
- [ ] Date, environment, who ran it, anything unexpected
