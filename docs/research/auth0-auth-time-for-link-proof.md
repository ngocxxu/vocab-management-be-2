# Auth0 `auth_time` as proof of fresh sign-in before linking a second sign-in method

Date: 2026-10-17. Sources are primary only (Auth0 docs, OpenID Connect Core 1.0, RFC 9068). Anything not stated on a primary page is marked **unconfirmed**.

## Short answers

| #   | Question                                                   | Answer                                                                                                                                                                   |
| --- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `auth_time` in Auth0 ID tokens by default?                 | No. Auth0 adds it when the authorize request has `prompt=login` or `max_age` (Auth0 doc says `max_age=0`; OIDC says any `max_age`). Not in the default sample ID token.  |
| 2   | In Auth0 access tokens for a custom API?                   | No. Not in the Auth0 access token claim list. A Post-Login Action cannot add a claim literally named `auth_time` (it is on the restricted list).                         |
| 3   | With `prompt=login`, is it the time of that fresh sign-in? | Yes for Auth0-native (database) connections, per Auth0 and OIDC. For upstream IdPs (social/enterprise) Auth0 only guarantees an exchange with the upstream IdP happened. |
| 4   | Does a refreshed ID token keep the original `auth_time`?   | OIDC says yes (MUST). Auth0 docs do not state it: **unconfirmed** for Auth0.                                                                                             |
| 5   | What to validate?                                          | See section 5. Bind with `sub` (and `azp`/`aud`); `at_hash` is optional per OIDC and **unconfirmed** as emitted by Auth0.                                                |
| 6   | Design                                                     | See section 6.                                                                                                                                                           |

## 1. ID token: when is `auth_time` present?

- OIDC Core section 2 (ID Token), `auth_time`: "Time when the End-User authentication occurred." It is REQUIRED "when a max_age request is made or when auth_time is requested as an Essential Claim", otherwise optional. Value is seconds since the Unix epoch.
- OIDC Core 3.1.2.1, `max_age`: "Specifies the allowable elapsed time in seconds since the last time the End-User was actively authenticated by the OP." If exceeded, the OP MUST attempt to actively re-authenticate. "When max_age is used, the ID Token returned MUST include an auth_time Claim Value."
- Auth0, "Force Reauthentication in OIDC" (https://auth0.com/docs/authenticate/login/max-age-reauthentication): the claim "will be included automatically in the ID token when `prompt=login` or `max_age=0` parameters are given". Auth0 says it "made a choice to send the `auth_time` claim in the ID token when responding to a `prompt=login`" request. So `prompt=login` alone is enough to get `auth_time` in the ID token.
- Auth0 ID token structure page (https://auth0.com/docs/secure/tokens/id-tokens/id-token-structure) and Get ID Tokens page: neither mentions `auth_time`. The default sample ID token has none. Presence is therefore conditional, not default.
- Whether `max_age` values other than 0 also cause `auth_time` in Auth0: the Auth0 page only names `max_age=0` and `prompt=login`. The OIDC rule says any `max_age`. For our flow it does not matter, since we send `prompt=login`.
- Do not assume it is present: the backend must reject an ID token with no `auth_time`.

## 2. Access token: is `auth_time` present? Can an Action add it?

- Auth0 access token profile (https://auth0.com/docs/secure/tokens/access-tokens/access-token-profiles): always-present claims are `iss, sub, aud, azp, exp, iat, scope`. Case-specific: `gty, permissions, org_id, org_name, authorization_details, cnf, sub_profile, client_profile, act`, plus custom claims. No `auth_time`.
- RFC 9068 section 2.2.1: `auth_time`, `acr`, `amr` are OPTIONAL ("MAY be issued in the context of authorization grants involving the resource owner"); values "remain the same across all access tokens that derive from a given authorization response". Required claims are `iss, exp, aud, sub, client_id, iat, jti`. RFC 9068 only points to OIDC Core section 2 for the meaning. Auth0 does not implement the optional ones by default.
- Can a Post-Login Action add it? Not under that name. "Create custom claims" (https://auth0.com/docs/secure/tokens/json-web-tokens/create-custom-claims) lists `auth_time` among restricted claim names (with `iat`, `exp`, `sid`, `nonce`, `at_hash`, `acr`, `amr`, and others). It says that on a collision "the transaction doesn't fail, but the custom claim isn't added to the token". So `api.accessToken.setCustomClaim('auth_time', ...)` is silently dropped. A namespaced name (e.g. `https://vocab.example/auth_time`) is allowed.
- Which event field could feed a namespaced claim? The Post-Login event object (https://auth0.com/docs/customize/actions/explore-triggers/signup-and-login-triggers/login-trigger/post-login-event-object) documents:
    - `event.session.authenticated_at`: "The date and time when the session was last authenticated." Marked Enterprise-only, and the timestamp format is not specified.
    - `event.authentication.methods`: "authentication methods a user has completed during their session". The docs do not define per-method fields, so a `timestamp` field is **unconfirmed** from this page.
    - `event.transaction.prompt`: list of instructions about re-authentication prompting.
    - Caveat: "session last authenticated" is a session property, not necessarily "this transaction was a fresh interactive login". It would also be the value on a refresh-token exchange only if Actions run on refresh (Auth0 runs the Post-Login Action on refresh exchange too; the event-object page does not say which fields are populated then: **unconfirmed**).
- Conclusion: an access-token `auth_time` is not a built-in option. Using the ID token (as chosen) is the primary-source-supported path.

## 3. `prompt=login` and the meaning of `auth_time`

- OIDC Core 3.1.2.1 and 3.1.2.3: with `prompt=login` "The Authorization Server SHOULD prompt the End-User for reauthentication" (MUST error with `login_required` if it cannot). 3.1.2.3 says the AS "MUST reauthenticate the End-User even if the End-User is already authenticated".
- Auth0's page says the same direction, but adds limits: for `prompt=login` "the RP has no way to validate that a re-authentication action has taken place" by spec alone, hence the client must validate `auth_time` itself ("Unlike `max_age=0`, the client must manually perform validation on the `auth_time` parameter"). It also says "it's solely up to the RP to validate that it is receiving an ID token with an appropriate `auth_time`".
- Known issue (same page): "Auth0 can only guarantee that an exchange took place with the upstream identity provider." and "Forcing re-authentication within the upstream identity provider is not something Auth0 supports". So when the second sign-in method is a social/enterprise connection, `auth_time` may reflect an exchange with the upstream IdP, which can reuse its own session without asking for credentials. For database logins it is a real credential prompt.
- Consequence for our design: `auth_time` proves "Auth0 completed a login transaction at time T", which is strictly stronger than `iat` of an access token but not a guarantee of a typed password on upstream IdPs.

## 4. Refreshed ID token and `auth_time`

- OIDC Core 12.2: a refresh response "might not contain an id_token". If it does: `iss` MUST be the same as in the original ID token, `iat` MUST be the time the new ID token is issued, and "if the ID Token contains an auth_time Claim, its value MUST represent the time of the original authentication".
- Auth0 (https://auth0.com/docs/secure/tokens/refresh-tokens/use-refresh-tokens): if the initial scope included `openid`, a new ID token is in the refresh response; use it to refresh ID token claims. The page says nothing about `auth_time` or `iat` in that ID token. Whether Auth0 includes `auth_time` in refreshed ID tokens, and whether it keeps the original value: **unconfirmed** (a search of auth0.com returned no page stating this; a direct test is needed).
- Practical rule: treat `iat` of any token as irrelevant to freshness. Only trust `auth_time` from an ID token the backend sees together with a one-time proof that it came from the just-finished authorize request (nonce, see below). A refreshed ID token should be rejected for link proof even if its `auth_time` is old-but-valid, because the nonce will not match (OIDC 12.2 does not require `nonce` in refresh-issued ID tokens; Auth0 behaviour **unconfirmed**).

## 5. What the backend should validate on the ID token

OIDC Core 3.1.3.7 (validation list), applied to "proof only" use:

1. Signature: RS256 against Auth0 JWKS for `https://<tenant>/` (3.1.3.7 steps 6-7: `alg` should be RS256).
2. `iss` exactly equals the tenant issuer URL (with trailing slash as Auth0 issues it).
3. `aud` contains our FE application's client ID (not the API audience). If `aud` has several values or `azp` is present, `azp` must equal the client ID (steps 3-5).
4. `exp` in the future (step 9). `iat` sanity range is optional (step 10).
5. `nonce` present and equal to the value we issued (step 11). See binding below.
6. `auth_time` present, and `now - auth_time <= 300 s` (step 13: "If auth_time was requested [or max_age used], the Client SHOULD check it"). Allow a small clock skew (for example 30-60 s), reject `auth_time` in the future beyond skew, and reject if missing.
7. Reject if the ID token has `auth_time` but the request did not use `prompt=login` or `max_age` (not detectable server-side; nonce challenge below is the substitute).

Binding the ID token to the access token / same sign-in:

- `sub` equality: ID token `sub` must equal the access token `sub` of the call (OIDC `sub` is "locally unique and never reassigned" within the issuer). Weak by itself: it proves same user, not same sign-in event.
- `at_hash` (OIDC 3.1.3.6, 3.1.3.8): in the Authorization Code flow `at_hash` is OPTIONAL, and the client "MAY" use it to validate the access token (left half of SHA-256 of the access token ASCII octets, base64url, hash chosen by the `alg` header). Auth0's docs list `at_hash` among restricted claim names (implying Auth0 sets it), but no Auth0 page I fetched states that code-flow ID tokens carry `at_hash`: **unconfirmed**. Use it only if present, never as a requirement, and note it binds the ID token to one specific access token, which breaks if the FE later refreshes the access token before calling the link endpoint.
- `nonce` is the strongest available link: the backend issues a single-use random nonce, the FE passes it as the `nonce` param on `/authorize` (together with `prompt=login`), and the backend later checks that the ID token's `nonce` equals the stored one and consumes it. That ties the ID token to this server-initiated sign-in and kills replay of old ID tokens.
- `sid` (session ID) in the ID token vs. the access token: Auth0 restricts the name `sid` but the access token profile page does not list `sid`: access-token `sid` **unconfirmed**; do not rely on it.

## 6. Minimal recommended design for our case

1. `POST /auth/link/challenge` (authenticated with the first account's access token): backend creates a random nonce, stores `{userId, nonce, createdAt}` in Redis with TTL about 10 min, returns it.
2. FE runs the second login: `/authorize` with Authorization Code + PKCE, `prompt=login`, `nonce=<server nonce>`, and `scope=openid ...`, using the second connection. FE obtains both tokens from `/oauth/token`.
3. `POST /auth/link` with access token (Authorization header) plus the second login's ID token in the body (and the nonce is implicit by lookup).
4. Backend: verify the ID token as in section 5 (signature, `iss`, `aud` = client ID, `exp`, `nonce` matches and is consumed atomically, `auth_time` present and within 5 min, `sub` equals the `sub` of the presented access token). If `at_hash` is present, also check it against the presented access token; skip if absent.
5. Only then perform the link. Drop the access-token `iat` check, or keep it as a secondary sanity check only; it is not freshness evidence (a refresh-token exchange gives a new `iat`).
6. Do not try to emit `auth_time` into the access token via an Action; it is a restricted name and is silently dropped. If an access-token claim is ever wanted, use a namespaced claim fed from `event.session.authenticated_at` (Enterprise plan only, semantic caveat in section 2). That option is not needed with the nonce design.
7. Document the residual risk: for social/enterprise second methods, `auth_time` means "Auth0 exchanged with the upstream IdP at T" (Auth0 known-issue text), not necessarily "user typed credentials at T".

## Unconfirmed items (need a direct test against our tenant)

- Whether `max_age` greater than 0 (not just 0 / `prompt=login`) yields `auth_time` in Auth0 ID tokens.
- Whether Auth0 includes `auth_time` in refreshed ID tokens, and whether it keeps the original value (OIDC 12.2 requires it; Auth0 docs silent).
- Whether Auth0 code-flow ID tokens carry `at_hash`.
- Whether `event.authentication.methods[].timestamp` exists (field not documented on the event-object page) and what Actions populate on refresh exchanges.
- Whether Auth0 includes `nonce` in ID tokens issued from refresh exchanges.

## Sources

- https://auth0.com/docs/authenticate/login/max-age-reauthentication
- https://auth0.com/docs/secure/tokens/id-tokens/id-token-structure
- https://auth0.com/docs/secure/tokens/id-tokens/get-id-tokens
- https://auth0.com/docs/secure/tokens/access-tokens/access-token-profiles
- https://auth0.com/docs/secure/tokens/json-web-tokens/create-custom-claims
- https://auth0.com/docs/secure/tokens/refresh-tokens/use-refresh-tokens
- https://auth0.com/docs/customize/actions/explore-triggers/signup-and-login-triggers/login-trigger/post-login-event-object
- https://auth0.com/docs/customize/actions/explore-triggers/signup-and-login-triggers/login-trigger/post-login-api-object
- https://openid.net/specs/openid-connect-core-1_0.html (sections 2, 3.1.2.1, 3.1.2.3, 3.1.3.6, 3.1.3.7, 3.1.3.8, 12.2)
- https://www.rfc-editor.org/rfc/rfc9068 (section 2.2, 2.2.1)
