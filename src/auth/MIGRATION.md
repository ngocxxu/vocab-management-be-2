# Auth migration notes

## Global guard change

`ApplicationModule` now registers **`GlobalAuthGuard`** instead of the legacy Supabase **`AuthGuard`**. Protected routes expect **`Authorization: Bearer <token>`** where the token is either an **app JWT** (HS256, `JWT_SECRET` / `JWT_ISSUER`) or a **Supabase access token** (default strategy **`combined`**: try JWT first, then validate with Supabase `auth.getUser`).

The API **does not** set auth **`Set-Cookie`** headers. Use tokens from **`SessionDto`** (`access_token`, `refresh_token`) and send **`Authorization: Bearer <access_token>`** on protected routes.

## `request.authUser` and `request.currentUser`

- **`authUser`**: normalized **`AuthUser`** from the access token (`@/auth`).
- **`currentUser`**: Prisma **`User`** when a row matches **`User.id`** or **`User.supabaseUserId`** to **`authUser.id`** (`bindAuthUserToRequest`). If there is no row, `currentUser` is undefined.

Legacy **`@CurrentUser()`** from `@/shared/decorators` still reads **`currentUser`** (Prisma). Migrate handlers to **`@/auth`** **`CurrentUser`** when you want **`AuthUser`**.

## `@Roles` and `RolesGuard`

Single implementation: **`Roles`** (re-exported from **`@/shared/decorators`** for convenience) and **`RolesGuard`** from **`@/auth`**, also re-exported via **`@/shared`**.

**`RolesGuard`** checks **`authUser.roles`** first (JWT claims or Supabase **`user_metadata` / `app_metadata`** key **`roles`**). If that array is empty, it falls back to Prisma **`currentUser.role`** so routes still work when the token carries no role claims but the user row exists.

## `@Public()`

Canonical implementation is under **`@/auth/decorators`**. **`@/shared/decorators/public.decorator`** re-exports it; metadata key remains **`isPublic`**.

## Refresh tokens

Out of scope for this package: refresh issuance, rotation, and Supabase session refresh.

## Scope

Roughly **9 controllers** / **~48** `@CurrentUser()` call sites still assume Prisma **`User`** until migrated.

## Example routes

Set **`AUTH_EXAMPLE_ROUTES_ENABLED=true`** to register **`ExampleAuthDecoratorsController`** (`/auth/examples/*`).
