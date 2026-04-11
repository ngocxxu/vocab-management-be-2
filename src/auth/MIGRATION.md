# Auth migration notes

## Global guard change

`ApplicationModule` now registers **`GlobalAuthGuard`** instead of the legacy Supabase **`AuthGuard`**. Protected routes expect **`Authorization: Bearer <token>`** where the token is either an **app JWT** (HS256, `JWT_SECRET` / `JWT_ISSUER`) or a **Firebase ID token** (default strategy **`combined`**: try JWT, then Firebase per plan rules).

Cookie-only Supabase sessions **no longer** satisfy the global guard unless you add **`@Public()`** or the client sends a Bearer token.

## `request.authUser` and `request.currentUser`

- **`authUser`**: normalized **`AuthUser`** from the access token (`@/auth`).
- **`currentUser`**: Prisma **`User`** when a row matches **`User.id`** or **`User.supabaseUserId`** to **`authUser.id`** (`bindAuthUserToRequest`). If there is no row, `currentUser` is undefined.

Legacy **`@CurrentUser()`** from `@/shared/decorators` still reads **`currentUser`** (Prisma). Migrate handlers to **`@/auth`** **`CurrentUser`** when you want **`AuthUser`**.

## `@Roles` and `RolesGuard`

- **`@/auth`** **`Roles`** + **`RolesGuard`** use **`authUser.roles`** (string array from JWT claims or Firebase custom claim **`roles`**).
- **`@/shared`** **`Roles`** + **`RolesGuard`** use Prisma **`currentUser.role`** / Supabase metadata — different metadata keys; do not mix on the same route.

## `@Public()`

Canonical implementation is under **`@/auth/decorators`**. **`@/shared/decorators/public.decorator`** re-exports it; metadata key remains **`isPublic`**.

## Refresh tokens

Out of scope for this package: refresh issuance, rotation, and Supabase session refresh.

## Scope

Roughly **9 controllers** / **~48** `@CurrentUser()` call sites still assume Prisma **`User`** until migrated.

## Example routes

Set **`AUTH_EXAMPLE_ROUTES_ENABLED=true`** to register **`ExampleAuthDecoratorsController`** (`/auth/examples/*`).
