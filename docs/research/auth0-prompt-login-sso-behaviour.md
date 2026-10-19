# Auth0 prompt=login, max_age and SSO behaviour

Research note. Fetched 2026-10-17.

Scope: Auth0 documentation, OpenID Connect Core 1.0, and Google's OpenID Connect documentation. Community forum posts, third-party blogs and search-result snippets were used only to find pages, never as evidence. No live tenant test was run, so every answer below is documentation-based.

Status labels:

- CONFIRMED: a primary page states it. Key points were re-checked with a second fetch or the `.md` mirror.
- PARTLY: stated for one case only; the other case is inferred.
- INFERRED: follows from primary wording but is not stated outright.
- UNCONFIRMED: no primary source found. Do not rely on it.

Statements are paraphrased. Headings are quoted as they appear.

## Short answers

| #   | Question                                                                                        | Answer                                                                                                                                                                                                                                                                       | Status                                                            |
| --- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1   | prompt=login with an active Auth0 SSO session: is a new login required?                         | Auth0 still displays the login page; it does not skip it. Auth0 documents prompt=login as a UX hint that the relying party (RP) cannot verify from the token alone. Whether the user must re-type a password is only implied for database connections.                       | CONFIRMED (login page shown); PARTLY (credential re-entry)        |
| 2   | What prompt=login guarantees for a database connection vs a social connection                   | Database: login page is shown and Auth0 defines re-authentication as re-entering the password. Social: Auth0 cannot force re-authentication at the upstream provider. It can only guarantee that an exchange with that provider happened.                                    | CONFIRMED                                                         |
| 3   | Does Auth0 send the user to Google on prompt=login, and can Google re-authenticate silently?    | Social login does send the user to the upstream provider. Auth0 does not document how prompt=login is passed to Google. Google's documented prompt values do not include `login`. Whether Google shows its own login screen under a forwarded prompt=login is not confirmed. | PARTLY; UNCONFIRMED for Google's behaviour                        |
| 4   | Is auth_time reset to the new authentication time?                                              | Auth0 says the upstream exchange updates auth_time, and auth_time is included when prompt=login or max_age=0 is sent. For social logins this means the time of the exchange, which can be silent. For database logins the reset is inferred.                                 | CONFIRMED (social exchange); INFERRED (database)                  |
| 5   | What must a backend check to prove a new authentication for a specific connection after time T? | Store the request time T server-side before the redirect. Send max_age=0 or prompt=login. Validate the nonce. Require auth_time, require auth_time later than T, and do the check server-side. Auth0's docs do not confirm how to read the connection from the ID token.     | CONFIRMED for time and nonce; UNCONFIRMED for connection identity |

## Sources

Primary pages read:

- S1. "Force Reauthentication in OIDC": https://auth0.com/docs/authenticate/login/max-age-reauthentication (also checked as `.md`)
- S2. Universal Login experience, including the `/authorize` prompt table: https://auth0.com/docs/authenticate/login/auth0-universal-login/universal-login-vs-classic-login/universal-experience
- S3. `/authorize` reference: https://auth0.com/docs/api/authentication/authorization-code-flow/authorize-application (checked as `.md` too)
- S4. "Single Sign-On": https://auth0.com/docs/authenticate/single-sign-on
- S5. "Social Identity Providers" overview: https://auth0.com/docs/authenticate/identity-providers/social-identity-providers
- S6. Google social connection setup: https://auth0.com/docs/authenticate/identity-providers/social-identity-providers/google
- S7. "SSO for regular web apps, part 3": https://auth0.com/docs/get-started/architecture-scenarios/sso-for-regular-web-apps/part-3
- S8. Sessions overview: https://auth0.com/docs/manage-users/sessions (checked; does not cover prompt or max_age)
- S9. User profile structure: https://auth0.com/docs/manage-users/user-accounts/user-profiles/user-profile-structure
- S10. Validate ID tokens: https://auth0.com/docs/secure/tokens/id-tokens/validate-id-tokens
- S11. ID token structure: https://auth0.com/docs/secure/tokens/id-tokens/id-token-structure (checked; no auth_time or max_age content)
- S12. OpenID Connect Core 1.0: https://openid.net/specs/openid-connect-core-1_0.html (sections 2, 3.1.2.1, 3.1.2.3, 3.1.3.7)
- S13. Google OpenID Connect: https://developers.google.com/identity/openid-connect/openid-connect

Not found:

- A page titled "Use Auth0 to log in users with social identity providers". The closest match is S5, which is titled "Social Identity Providers", and S6.
- An Auth0 changelog or known-issue entry saying prompt=login is ignored when an SSO session exists. The only known-issues section found is in S1. A release-notes search was not exhaustive.

## 1. prompt=login with an active Auth0 SSO session

- Baseline without prompt=login (S4, CONFIRMED): when an Auth0 SSO cookie exists, a returning user gets no login screen.
- prompt=login (S2, CONFIRMED): the `/authorize` table in the Universal Login page shows that with an existing session, prompt=login still displays the login page. The same holds with `screen_hint=signup`, which shows the signup page. This is the only place Auth0 documents prompt=login behaviour with a session. The `/authorize` reference (S3) lists only `prompt=none`.
- Auth0 treats prompt=login as a UX hint (S1, CONFIRMED). A browser can strip the parameter, and the RP cannot tell from the ID token whether a fresh login happened unless it checks auth_time.
- Definition of re-authentication (S1, CONFIRMED): re-authentication means the user re-enters their password. Step-up means the user completes a multifactor method that is already configured.
- Combined reading (INFERRED): for a database connection, the page shown is the credential form, so the intended result is credential re-entry. The table only says the page is displayed. It does not say that a password must be submitted in every case.
- Spec (S12, CONFIRMED that the spec says this): prompt=login asks the OP to prompt for re-authentication (section 3.1.2.1, "should"). A stronger sentence in section 3.1.2.3 says the OP must re-authenticate even when the user already has a session. The section number for that sentence came from one fetch and should be re-checked. The Auth0 pages reviewed do not state that Auth0 implements that MUST literally (UNCONFIRMED).
- Lock nuance (S7, summary-level, not checked verbatim): with an existing Auth0 SSO session, Lock may offer to log in again as the same user, and the page describes this as not requiring the upstream credentials to be re-entered. Treat this as a caveat for any flow that uses Lock.
- max_age (S1, CONFIRMED): with max_age=N, Auth0 forces a new authentication only when more than N seconds have passed since the last one. The page presents this as a freshness rule inside a longer SSO session. With max_age=0 Auth0 forces a fresh login.

## 2. What prompt=login guarantees, by connection type

Database connection:

- Auth0 shows the login page regardless of session (S2, CONFIRMED).
- auth_time is added to the ID token when prompt=login is sent (S1, CONFIRMED).
- The RP cannot validate a fresh login from the prompt alone, and must check auth_time (S1, CONFIRMED).

Social connection (for example google-oauth2):

- Forcing re-authentication at the upstream provider is not something Auth0 supports (S1, Known issues, CONFIRMED).
- External identity providers may or may not support forced re-authentication (S1, CONFIRMED).
- prompt=login or prompt=consent generally signals a social provider to re-authenticate, but Auth0 cannot enforce it (S1, CONFIRMED).
- The page's diagram alt text says federated connections do not force re-authentication (S1, CONFIRMED).
- The method in S1 "assumes you use database connections" (S1, CONFIRMED).
- Auth0 can only guarantee that an exchange with the upstream identity provider took place (S1, CONFIRMED).

## 3. Redirect to Google, and silent re-authentication

- Social login sends the user to the upstream provider. S4 says an upstream session exists when the user logged in through an identity provider. S2 says Universal Login shows a button for each social connection (CONFIRMED in general).
- Baseline without prompt=login (S7, CONFIRMED): if the user is already signed in to the provider (Google and Facebook are the examples), the provider does not prompt for sign-in again. A consent step may still appear.
- Google One Tap (S2, CONFIRMED): when enabled, One Tap uses the user's active Google session from the Universal Login page.
- Forwarding prompt=login to Google (UNCONFIRMED): S1 says prompt=login generally signals a social provider to re-authenticate. S6 does not describe passing prompt, max_age or any other parameter to Google. S3 documents only `prompt=none` on `/authorize`. The mechanism is not documented.
- Google's documented prompt values (S13, CONFIRMED): `none`, `consent` and `select_account`. `login` is not listed. `none` shows no UI and returns an error if the user is not already signed in. `max_age` is not listed on the page.
- Conclusion (UNCONFIRMED): no primary source shows that Google re-prompts for credentials when Auth0 sends prompt=login. Do not assume it does, and do not assume Google re-authenticates silently. Auth0 says it cannot enforce re-authentication upstream, and Google's docs do not document `login`.

## 4. Is auth_time reset to the new authentication time?

- auth_time is included when prompt=login or max_age=0 is in the request (S1, CONFIRMED).
- Auth0's exchange with the upstream identity provider results in an updated auth_time (S1, CONFIRMED).
- One fetch summary said this applies whether or not the user signed in again. The sentence was not verified verbatim (UNCONFIRMED).
- Social logins (INFERRED): auth_time reflects the time of the upstream exchange, which can happen silently. It is not proof that the user typed credentials. This follows from S1's "exchange" wording plus the Known issues section.
- Database logins (INFERRED): no primary sentence states the reset rule. OIDC section 2 defines auth_time as the time the end-user authentication occurred (S12, CONFIRMED). S1's validation method, which compares the request time with auth_time, only makes sense if a new login moves auth_time forward.
- Google's ID token (S13, CONFIRMED that auth_time is listed; its meaning is "time user authentication took place"). Google's rules for when it is included or updated are not documented on that page (UNCONFIRMED).

## 5. What a backend must check

Use these steps. Items marked CONFIRMED come from the primary pages; the rest are design notes.

1. Store the request time T on the server before redirecting, bound to the login transaction (state and nonce). S1 describes this exact approach (CONFIRMED).
2. Send `max_age=0` or `prompt=login`. Both cause auth_time to be included (S1, CONFIRMED). S1 says a recent spec update treats max_age=0 as effectively prompt=login. The wording was not found in the OIDC Core text read here, so attribute it to S1 (CONFIRMED for S1 only).
3. Validate the ID token on the server. The nonce must exactly match the value sent (S10, CONFIRMED; also OIDC section 3.1.3.7 step 11). S10 defers the signature, iss and exp checks to a separate guide that was not read here (UNCONFIRMED in this pass).
4. Require that auth_time is present. OIDC section 2 says it is REQUIRED when max_age is requested (S12, CONFIRMED).
5. Check the SHOULD in OIDC section 3.1.3.7 step 13: if auth_time was requested, the client should check it and request re-authentication when too much time has passed (S12, CONFIRMED). This is a SHOULD, so the RP has to implement it explicitly.
6. Require auth_time later than T (S1, CONFIRMED: compare the stored request time with the claim and require a later timestamp). The docs do not say how to handle clock skew or same-second timestamps. That is a design decision.
7. Do the check on the server. S1 warns against relying on client-side verification of the ID token or auth_time (CONFIRMED).
8. Identify the connection (UNCONFIRMED). S9 shows that the user profile's `identities` array contains `connection`, `provider`, `isSocial` and `user_id` (CONFIRMED). That is on the user object, not in the ID token. S9 shows connection-prefixed IDs such as google-oauth2|... as examples only. S10 does not describe `sub`. The primary pages read do not show a connection claim in the ID token. A reliable approach would be to read the user's identity record or add a claim through an Auth0 Action. Neither was verified here.

Limit of the proof: for a social connection, the checks above prove that an exchange with the upstream provider happened after T. They do not prove that the user re-typed Google credentials. Auth0 says it cannot enforce upstream re-authentication (S1). If a policy needs stronger proof, the pages read here do not provide one. Step-up or MFA is a separate Auth0 feature and was not checked (UNCONFIRMED).

## Gaps and discrepancies

- The `/authorize` reference (S3) documents only `prompt=none`. The login behaviour is documented on S2 and S1, not on the reference page.
- OIDC uses "should" for prompt=login in section 3.1.2.1 and "must" in section 3.1.2.3 (S12). The two read differently; treat the MUST as the stronger requirement.
- Google's docs (S13) list `none`, `consent` and `select_account`, but not `login`, and do not list `max_age`. Google-side behaviour for prompt=login therefore has no primary source.
- Fetch summaries of S13 gave conflicting detail on auth_time. Only the claim name and meaning are used above.
- S1 mentions a recent spec update on max_age=0 that was not found in the OIDC Core text read here.
- The page titled "Use Auth0 to log in users with social identity providers" was not found, so S5 and S6 were used instead.

## Relevance to this repository

This matters for the second-login link proof on the current branch (feat/link-second-login). For a social second login, a fresh auth_time proves an upstream exchange happened after the stored request time. It does not prove the user re-entered Google credentials. The docs read here offer no stronger proof for social connections. There is also an untracked file, docs/research/auth0-auth-time-for-link-proof.md. It was not reviewed for this note and should be checked for overlap before it is committed.
