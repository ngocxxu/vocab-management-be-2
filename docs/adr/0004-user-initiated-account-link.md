# A User links a new login themselves from an authenticated session; the admin link stays as a fallback

ADR 0003 left one case to an admin: a new login whose email already belongs to a User is refused with `account_link_required`, and an admin attaches the Identity by hand. We keep that rule, and add a second way to resolve the case: the User signs in with their existing login, then connects the new login from that authenticated session, proving they control both. An admin link stays available as a fallback.

The Account link still never happens automatically and never by email. What decides the link is the authenticated session plus a fresh sign-in with the new login, not a matching address. The new login must carry a verified email, and that email need not equal the User's email, because possession of both logins is already proven.

We chose this over keeping the admin-only link, and over linking silently by verified email. Admin-only does not scale and leaves a returning User locked out until someone acts. Silent linking by email is what Auth0 advises against: an attacker can create a password login with a victim's address and be merged into the victim's account, and `email_verified` only reduces that risk. GitHub and Meta resolve the same collision by sending the User back to the existing login and linking from there (see `docs/research/`).

We also refuse a password Provider sign-up whose email already belongs to a User, so the collision is caught at sign-up instead of at the first login. The message tells the User the email exists. We accept that this reveals that an address is registered.

## How the proof works

The link is a row in our own Identity table (`user_identity`), not Auth0's account linking. Auth0's merge would give the second login the first login's `sub` and hide it from our mapping. No Management API call is made.

The proof has four parts, and each one closes a different gap:

1. **Nonce issued by the BE, single use.** `POST /auth/identities/link-nonce` (session token required) stores a random nonce bound to the signed-in User, with a 5-minute expiry, the same window as the `auth_time` check: a login that completes after the nonce expires cannot be linked anyway. The FE passes it to Auth0 as the `nonce` parameter of the second login. Auth0 copies it into the ID token. This ties the ID token to this request: an ID token from some other login, however fresh, cannot be submitted to this session. The BE reads the nonce from the verified ID token and consumes it in one conditional update (`used = false`, not expired, bound to the same User). Consuming happens after the match and before the later checks, so a nonce cannot be retried even when a later check fails.
2. **Fresh sign-in.** The FE sends `prompt=login` and `max_age=300`. Auth0 then puts `auth_time` in the ID token, and the BE accepts it only when `auth_time` is at most 5 minutes old. `iat` is not used: a refresh-token exchange gives a fresh `iat` without a new sign-in, while `auth_time` keeps the time of the real sign-in. For social connections, `prompt=login` may be satisfied by the upstream provider's existing session, so `auth_time` proves a fresh exchange with that provider, not that the user typed a password. This limit is accepted.
3. **Auth0 ID token only.** The second login's ID token is verified with the signing keys, `iss` (the tenant), `aud` (the FE client id), and `exp`. Supabase tokens are never accepted for the second login. The access token is not used as the proof.
4. **Session of the User.** The link request carries the session token of the User who requested the nonce. The User who consumes the nonce must be that same User. A nonce alone is not enough.

The second login must have a verified email, and that email is not compared with the User's email.

## Consequences

- The link endpoint is throttled, and every attempt is logged with the User id and issuer, never the email.
- Linking the same pair again is idempotent. A pair already mapped to another User is refused.
- The FE forces the sign-in and keeps the User's own session cookies unchanged during the link.
- Two new error codes exist beyond ADR 0003: `link_nonce_invalid` (nonce missing, used, expired, or bound to another User) and `id_token_invalid`.
- The BE needs the Auth0 client id as configuration (`AUTH0_CLIENT_ID`) to check the ID token audience.

This must land before the Supabase contract step (#35): the admin link script matches on `users.supabase_user_id`, the User-initiated link does not, so dropping that column no longer strands unlinked Users.
