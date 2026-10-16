# Auth migration notes

## Global guard change

`ApplicationModule` now registers **`GlobalAuthGuard`** instead of the legacy Supabase **`AuthGuard`**. Protected routes expect **`Authorization: Bearer <token>`** where the token is either an **Auth0 access token** (RS256, verified against the tenant JWKS with `AUTH0_ISSUER` / `AUTH0_AUDIENCE`) or a **Supabase access token**. Default strategy **`combined`** picks the verifier from the token's `iss`: the configured Auth0 issuer goes to Auth0 and is never retried against Supabase; anything else goes to Supabase `auth.getUser`. With `AUTH0_ISSUER` unset only Supabase tokens are accepted.

The API **does not** set auth **`Set-Cookie`** headers. Use tokens from **`SessionDto`** (`access_token`, `refresh_token`) and send **`Authorization: Bearer <access_token>`** on protected routes.

## `request.authUser` and `request.currentUser`

- **`authUser`**: normalized **`AuthUser`** from the access token (`@/auth`).
- **`currentUser`**: Prisma **`User`** resolved by **`AuthIdentityService`**. Auth0 tokens resolve only through the **`UserIdentity`** table (issuer + subject, never email); an unmapped identity gets 401 `identity_not_provisioned`. Supabase tokens resolve by **`User.supabaseUserId`** and may leave `currentUser` undefined. `authUser.id` is the internal `users.id` whenever a User was found.

Legacy **`@CurrentUser()`** from `@/shared/decorators` still reads **`currentUser`** (Prisma). Migrate handlers to **`@/auth`** **`CurrentUser`** when you want **`AuthUser`**.

## `@Roles` and `RolesGuard`

Single implementation: **`Roles`** (re-exported from **`@/shared/decorators`** for convenience) and **`RolesGuard`** from **`@/auth`**, also re-exported via **`@/shared`**.

**`RolesGuard`** uses only the database role (`currentUser.role`). Token role claims, from Auth0 or Supabase, are never read.

## `@Public()`

Canonical implementation is under **`@/auth/decorators`**. **`@/shared/decorators/public.decorator`** re-exports it; metadata key remains **`isPublic`**.

## Refresh tokens

Out of scope for this package: refresh issuance, rotation, and Supabase session refresh.

## Scope

Roughly **9 controllers** / **~48** `@CurrentUser()` call sites still assume Prisma **`User`** until migrated.

## Provisioning (`POST /auth/sync`)

The only route that accepts an Auth0 token with no mapped Identity (`@AllowUnprovisioned()`); every other route returns 401 `identity_not_provisioned` until it has run. It creates the `User` and its `UserIdentity` together, is idempotent, and creates exactly one `User` when two first calls race.

- Needs a verified email from the access token's **namespaced** claims (`<AUTH0_CLAIM_NAMESPACE>email`, `<ns>email_verified`; optionally `<ns>given_name`, `<ns>family_name`, `<ns>picture`), added by an Auth0 post-login Action. Only a boolean `true` counts as verified. Without a namespace nothing is read and sync returns 403 `email_not_verified`.
- If the email already belongs to another User it returns 409 `account_link_required` and writes nothing. Email is only used to detect that collision, never to link; an admin links the account by hand.

## Cutover

Step-by-step rollout, monitoring (`supabase_token_accepted` log line), rollback and issuer change: [docs/runbooks/auth0-cutover.md](../../docs/runbooks/auth0-cutover.md).
