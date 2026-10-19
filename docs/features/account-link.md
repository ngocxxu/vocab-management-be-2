# User-initiated account link

A signed-in User connects a second sign-in method (Google or password) from Settings. Both methods then open the same User.

- Decision and proof rules: [ADR 0004](../adr/0004-user-initiated-account-link.md)
- Terms (Identity, Account link, Sign-in method): [GLOSSARY.md](../../GLOSSARY.md)
- Admin fallback for password users: [auth0-password-user-linking runbook](../runbooks/auth0-password-user-linking.md)
- Tracking: parent #39; BE #43; FE #44; pre-registration rule #41

**Status:** the BE half (#43) is implemented: the nonce and link endpoints, ID token verification, and the `link_nonce` table. The FE half (#44) and the pre-registration rule (#41) are not. See [Gaps](#gaps-before-implementation).

## Core idea

A link is one row in `user_identity` mapping `(issuer, subject)` to a User. The session decides who is linked. The email never does. The proof that the caller controls the second login is an ID token obtained in a login started from that session, with a server-issued nonce and a fresh `auth_time`.

## Actors

| Actor        | Role                                                                      |
| ------------ | ------------------------------------------------------------------------- |
| Browser      | Holds cookies, follows redirects                                          |
| FE (Next.js) | Route handlers under `src/app/api/auth/*`; calls Auth0 and BE server-side |
| Auth0        | Universal Login, `/authorize`, `/oauth/token`                             |
| BE (NestJS)  | Verifies tokens, owns nonces and `user_identity`                          |

## Flow: login (existing, for reference)

1. Browser `GET /api/auth/login` (FE). FE writes the `auth0_txn` cookie and redirects to Auth0 `/authorize`.
2. Auth0 shows Universal Login, then redirects to `/api/auth/callback?code&state`.
3. FE callback calls Auth0 `POST /oauth/token` (code, `code_verifier`, client secret).
4. FE calls BE `POST /auth/sync` with `Authorization: Bearer <access_token>`. BE provisions or finds the User.
5. FE sets `accessToken` and `refreshToken` cookies and redirects into the app.
6. Every later API call: FE sends `Authorization: Bearer <accessToken>`. BE verifies the JWT and looks up `user_identity` by `(iss, sub)` on each request.

## Flow: link

Precondition: the User (A) is signed in and has an `accessToken` cookie.

```mermaid
sequenceDiagram
    autonumber
    actor U as Browser
    participant FE as FE Next.js
    participant AU as Auth0
    participant BE as BE NestJS
    participant DB as DB

    U->>FE: Settings: connect Google or add password
    FE->>BE: POST /auth/identities/link-nonce (Bearer AT of A)
    BE->>DB: insert nonce N {userId A, expires in 5 min, used=false}
    BE-->>FE: { nonce N }
    FE-->>U: set auth0_txn {state, verifier, purpose=link, userId A}; redirect
    U->>AU: GET /authorize (connection, prompt=login, max_age=300, nonce N, state, code_challenge)
    AU-->>U: login or signup for method B
    AU-->>U: redirect /api/auth/callback?code&state
    U->>FE: callback
    FE->>FE: compare state with cookie; check session still A (GET /auth/verify)
    FE->>AU: POST /oauth/token (code, verifier)
    AU-->>FE: id_token (B), access_token (dropped), refresh_token (not stored)
    FE->>BE: POST /auth/identities/link {idToken} (Bearer AT of A)
    BE->>BE: verify id_token: signature, iss, aud = AUTH0_CLIENT_ID, exp
    BE->>DB: UPDATE nonce SET used=true WHERE nonce=N AND used=false AND not expired AND userId=A
    BE->>BE: auth_time present and at most 300 s old?
    BE->>BE: email_verified = true?
    BE->>DB: owner of (iss, sub)?
    alt no owner
        BE->>DB: insert user_identity (A, iss, sub)
        BE-->>FE: 200 { methods }
    else owner is A
        BE-->>FE: 200 { methods } (no change)
    else owner is another User
        BE-->>FE: 409 identity_already_linked
    end
    FE-->>U: redirect to Settings with result; no accessToken or refreshToken written
```

### API calls in order

| #   | Caller to target   | Request                                                                                                                                                                                                                          | Success                                                        | Failure codes           |
| --- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------- |
| 1   | FE to BE           | `POST /auth/identities/link-nonce`, Bearer AT(A), no body                                                                                                                                                                        | 200 `{ nonce }` (response shape not fixed in ADR)              | 401                     |
| 2   | Browser to Auth0   | `GET /authorize`: `connection` (`google-oauth2` or `Username-Password-Authentication`), `screen_hint=signup` for a new password, `prompt=login`, `max_age=300`, `nonce`, `state`, `code_challenge`, `scope=openid profile email` | Universal Login                                                | Auth0 errors            |
| 3   | FE server to Auth0 | `POST /oauth/token`: `grant_type=authorization_code`, `code`, `code_verifier`, `redirect_uri`, `client_id`, `client_secret`                                                                                                      | `id_token` used; `access_token` and `refresh_token` not stored | Callback fails, no link |
| 4   | FE server to BE    | `POST /auth/identities/link`, Bearer AT(A), body `{ "idToken": "..." }`                                                                                                                                                          | 200 `{ methods: ["google", "password"] }`                      | see table below         |
| 5   | FE to BE           | `GET /auth/identities`, Bearer AT(A) (Settings refresh)                                                                                                                                                                          | 200 `{ methods }`                                              | 401                     |

The link endpoint is throttled at 5 requests per minute; the nonce endpoint at 10 per minute (#43).

Order of checks at step 4, as in ADR 0004:

1. Global guard verifies the session token; the User is A.
2. Verify the ID token: RS256 signature (JWKS), `iss`, `aud = AUTH0_CLIENT_ID`, `exp`.
3. Read the `nonce` claim and consume it in one conditional update: `used=false`, not expired, bound to A. Consumed even if a later check fails.
4. `auth_time` present and at most 300 s old.
5. `email_verified = true`. The email is not compared with A's email.
6. Owner of `(iss, sub)`: none → insert; A → 200 unchanged; another User → 409.

### Error codes

| Code                      | HTTP      | When                                                                                  |
| ------------------------- | --------- | ------------------------------------------------------------------------------------- |
| `id_token_invalid`        | 401       | Bad signature, `iss`, `aud` or `exp`                                                  |
| `link_nonce_invalid`      | not fixed | Nonce missing, used, expired, or bound to another User; or nonce claim does not match |
| `link_proof_stale`        | 403       | `auth_time` missing or older than 300 s                                               |
| `email_not_verified`      | 403       | `email_verified` is not true                                                          |
| `identity_already_linked` | 409       | `(iss, sub)` belongs to another User                                                  |
| `account_link_required`   | 409       | Login path only: first login with an email that belongs to another User               |

### Retry after `email_not_verified`

This happens when a new password account is created in the link flow and its email is still unverified. The nonce was consumed at step 4.3, so the user must verify the email and start again from step 1 with a new nonce.

## Cookies

The flow uses three cookies. All are `httpOnly`, so browser JavaScript cannot read them. The FE server reads them.

| Cookie         | Set by                            | Holds                                                                             | Path        | Lifetime                            | Read by                                                                      | Purpose                                                              |
| -------------- | --------------------------------- | --------------------------------------------------------------------------------- | ----------- | ----------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `accessToken`  | Login callback; refresh route     | Auth0 access token                                                                | `/`         | 1 hour                              | FE server (`src/utils/server-api.ts`, `src/actions/auth.ts`, `src/proxy.ts`) | Session. FE server sends it to BE as `Authorization: Bearer`         |
| `refreshToken` | Login callback                    | Auth0 refresh token                                                               | `/`         | 7 days                              | Refresh route (`src/app/api/auth/refresh`)                                   | Gets a new access token after the 1-hour expiry without a new login  |
| `auth0_txn`    | Login route (both login and link) | `state`, PKCE `verifier`, redirect path; in link mode also `purpose` and `userId` | `/api/auth` | Short (`AUTH0_TXN_MAX_AGE_SECONDS`) | Callback                                                                     | Carries the login transaction across the redirects to and from Auth0 |

### Why these cookies exist

- **`accessToken` and `refreshToken` as cookies.** The browser needs a session that survives page loads. Keeping the token in an `httpOnly` cookie means page scripts cannot read it. The FE server attaches it to BE calls, so the token never has to be stored in JavaScript.
- **`auth0_txn`.** Login leaves the app and returns, and the FE server keeps no state between the two requests. The cookie carries three things:
    - `state` lets the callback reject a response it did not start (CSRF check).
    - The PKCE `verifier` is a secret. It is sent only from the FE server to Auth0 `/oauth/token`, never through the URL.
    - The redirect path returns the user to the page they came from.
      The callback deletes the cookie.

### Cookies in link mode

- The login route writes `auth0_txn` in link mode too, with `purpose=link`.
- The callback in link mode writes **no** `accessToken` or `refreshToken`. Writing them would replace A's session with the session of method B, or with nothing.
- The `userId` inside `auth0_txn` is a consistency check for the FE only. It is not trusted. The BE decides ownership from the nonce row, which is bound to A in the database, and from the session token. A forged `userId` in the cookie cannot make the BE link to someone else.

## Gaps before implementation

BE (#43) is done. What remains is on the FE and in Auth0:

- `readTokens` in the FE `src/libs/auth0.ts` reads only `access_token` and `refresh_token`. Link mode must read `id_token` (#44).
- The FE login route does not yet send `nonce`, `prompt=login`, `max_age`, or a link `purpose` (#44).
- `AUTH0_CLIENT_ID` must be set in each environment (the web app's client id). While it is empty every link request is refused with `id_token_invalid`.
- Password sign-up with an email that already belongs to a User is refused by the pre-registration rule (#41). The add-password path stays blocked until #41 is decided.
- Expired and used rows in `link_nonce` are not deleted yet. They are harmless (a spent or expired nonce is refused) and a cleanup job can follow.
