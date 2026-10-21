# Server-side "Add a password" for a Google-only Vocab User (sidestepping the public Auth0 sign-up)

Labels: **CONFIRMED** = stated on a primary Auth0 source; **PARTLY** = primary source covers part of it, or only a secondary source states it; **INFERRED** = my reasoning from cited facts; **UNCONFIRMED** = no reliable source found, test on a dev tenant.

Repo context checked: `docs/runbooks/auth0-password-user-linking.md` already uses this pattern manually: an admin creates the DB-connection login with the same email and sends the Auth0 "change password" email. The first `/auth/sync` then returns `409 account_link_required`. `src/domains/identity/auth0-management/auth0-management.service.ts` already gets a client-credentials token for `${issuer}api/v2/` and calls `DELETE /api/v2/users/{id}`.

## Q1. Backend creates the password user (POST /api/v2/users), then a password-change ticket or "set password" email

### Takeaway

This works and is the closest fit. The authenticated Settings endpoint calls `POST /api/v2/users` on `Username-Password-Authentication` with a random, discarded password (needs `create:users`). It writes the `user_identity` row straight away from the returned `user_id`, because the backend created that user and so knows its sub. Then it gets the user to set a password through a reset email that Auth0 sends or that the backend sends. Two caveats decide the design:

- **The Pre User Registration Action probably also runs for Management API creation**, so the issue #41 Action would block the backend's own call unless it has a safe exemption.
- **The ticket link must go to the mailbox by email, never back to the browser.** Otherwise nothing proves the person controls that email.

### Cited Findings

- **Endpoint, fields and scope (CONFIRMED).** `POST /api/v2/users`: only `connection` is required. `email`, `password`, `email_verified` (default false), `verify_email` (default false, "Overrides the behavior of `email_verified`"), `user_id`, `app_metadata` and `user_metadata` are optional. The request has `additionalProperties: false`. The scope is `create:users` (403: "Insufficient scope, expected any of: create:users"). `password` is "Only valid for auth0 connection strategy". — [Auth0 Mgmt API: Create a user](https://auth0.com/docs/api/management/v2/users/post-users)
- **A password is required in practice for a database connection (PARTLY, secondary).** The schema does not mark it required, but omitting it on a DB connection returns `Payload validation error: 'Missing required property: password'`. The community workaround is a random password that is never stored, followed by a reset link. — [Community: create without password](https://community.auth0.com/t/need-to-create-users-in-username-password-authentication-through-mgmt-api-without-supplying-password/69735); [Community: sandbox error](https://community.auth0.com/t/sandbox-error-internal-server-error-for-user-creation/8367); schema: [post-users](https://auth0.com/docs/api/management/v2/users/post-users)
- **Password-change ticket (CONFIRMED).** `POST /api/v2/tickets/password-change`, scope `create:user_tickets`. Parameters:
    - `user_id`, or `email` together with `connection_id`, but not both forms.
    - `client_id`, which is needed for the Password Reset Post Challenge trigger and for app details in the email and UI.
    - `result_url`, which applies only to classic Universal Login and cannot be combined with `organization_id`.
    - `ttl_sec`, defaulting to 432000 s (5 days).
    - `mark_email_as_verified`, defaulting to false.
    - `includeEmailInRedirect`.

    The response is documented only as "URL representing the ticket". — [Mgmt API: Create a password change ticket](https://auth0.com/docs/api/management/v2/tickets/post-password-change)

- **The ticket path does not prove mailbox ownership (CONFIRMED).** The ticket endpoint "generates a URL like the one in the password reset email" for when "the email delivery method is not appropriate". With a ticket, "your application is responsible for verifying the identity of the user in some other way". — [Change users' passwords](https://auth0.com/docs/authenticate/database-connections/password-change)
- **Auth0's invite pattern (CONFIRMED).** Create the user with `email_verified=false` and `app_metadata.needsInvitation=true`. Then either call the Authentication API change-password endpoint so Auth0 sends the email through the tenant's email provider, or "use the Management API to generate the password change ticket and email the ticket link to the user yourself". A Liquid branch in the "change password" template makes it read as an invite. — [Send email invitations for application signup](https://auth0.com/docs/customize/email/send-email-invitations-for-application-signup)
- **Auth0-sent alternative (CONFIRMED).** `POST /dbconnections/change_password` with `email` and `connection` (plus `client_id` if the post-challenge trigger is bound) returns "We've just sent you an email to reset your password." The page also lists a 404 "User not found". — [Auth API: Change password](https://auth0.com/docs/api/authentication/change-password/change-password)
- **Does Pre User Registration run for Management API creation?** The docs say it "runs when a user attempts to register through a Database or Passwordless connection, before the user is created". They do not mention the Management API or the Dashboard either way. — [Pre-user registration trigger](https://auth0.com/docs/customize/actions/explore-triggers/signup-and-login-triggers/pre-user-registration-trigger)
    - **PARTLY, secondary:** a community reply by rueben.tiow (5 Sep 2023, staff role not shown) says: "Yes, the Pre-User Registration Action will run when you create users using the Auth0 Dashboard." — [Community thread](https://community.auth0.com/t/are-pre-user-registration-actions-run-when-new-users-are-created-through-the-auth0-ui/115480)
    - **UNCONFIRMED:** whether a request field such as `event.client` or `event.request` is absent for Management API creation. The event-object page marks `event.client` and `event.transaction` optional but does not say when they are missing. — [Event object](https://auth0.com/docs/customize/actions/explore-triggers/signup-and-login-triggers/pre-user-registration-trigger/pre-user-registration-event-object)
- **Breached Password Detection covers signup, login and password reset (CONFIRMED).** Its toggles are "Block compromised credentials use for password reset" and similar ones for signup and login. Management API create and update are not mentioned. — [Breached Password Detection](https://auth0.com/docs/secure/attack-protection/breached-password-detection)
- **Password policy, history and dictionary (UNCONFIRMED).** Whether these apply to Management API–set passwords is not stated. — [Password options](https://auth0.com/docs/authenticate/database-connections/password-options)
- **Who sends the ticket email (PARTLY, conflicting secondary sources).** Community answers disagree on whether creating a ticket sends an email. Users report that no email was sent. — [Community: no email sent](https://community.auth0.com/t/send-email-invitations-for-application-signup-no-email-sent/189320); [Community: ambiguity](https://community.auth0.com/t/ambiguity-in-send-email-invitations-for-application-signup-docs/91967)

### Inferences

- **Proposed flow (INFERRED design).**
    1. The User is signed in. `POST /me/sign-in-methods/password` runs under the global auth guard. Optionally it requires a recent `auth_time`, reusing the existing fresh-ID-token check.
    2. The backend chooses the email. It does **not** accept a free-text email. It uses the verified email of an identity that User already owns, such as the Google identity's verified email from its ID token or the stored identity.
    3. Inside one guarded operation, the backend calls `POST /api/v2/users` with these fields: `{connection:"Username-Password-Authentication", email, password:<32+ random bytes, discarded>, email_verified:false, verify_email:false, app_metadata:{vocab_pending_link:true}}`.
    4. The backend inserts `user_identity(issuer, sub="auth0|"+returned id, userId)`. No nonce or ID token is needed, because the creation response is server-to-server proof that this sub exists and the backend created it for this User. The Management API call is the trust anchor.
    5. The backend triggers delivery of the reset email, either by having Auth0 send it (`/dbconnections/change_password`) or by creating a ticket with `mark_email_as_verified:true`, a short `ttl_sec` and `client_id`, and emailing the link from the backend's own mailer.
    6. The user sets the password in Universal Login's reset page and then logs in normally on the DB connection. `/auth/sync` finds the existing `(issuer, sub)` row and resolves to the same User, so no `account_link_required` is raised.
- **Never return the ticket URL to the browser.** If the page receives the link, a session hijacker or the account holder can set a password for a mailbox they may not control. Delivering it by email makes completion of the ticket the proof of mailbox control, which is what makes `mark_email_as_verified:true` defensible. (INFERRED from the "application is responsible for verifying the identity" statement above.)
- **`email_verified` at creation.** Setting `email_verified:true` directly is safe only when the address is byte-identical to an email the IdP (Google) already verified for this same User. Even then, prefer false plus `mark_email_as_verified` on the ticket, so verification happens only when the mailbox owner acts. If the Google email and the desired password email differ, mailbox proof is mandatory. (INFERRED)
- **Issue #41 Action conflict.** Assume the Action **will** run on the backend's own `POST /api/v2/users` (INFERRED from the Dashboard reply, since the Dashboard uses the Management API). Safe exemption options:
    - **(a) Server-side allow-list.** The Action calls a secret-authenticated backend endpoint, which allows the email only if a short-lived "pending password add" record exists for it. The backend writes that record from the authenticated Settings call just before creating the user. The endpoint is reachable only with the Action's secret, so it is not a public oracle.
    - **(b) `app_metadata` marker.** Only if a test shows that `event.user.app_metadata` is populated from the Management API body. The public `/dbconnections/signup` accepts `user_metadata` but not `app_metadata` (INFERRED; verify).
    - **Never use `user_metadata` or anything the public sign-up can send as the exemption marker.**
    - **Test on a dev tenant:** whether the Action fires for `POST /api/v2/users`, and the values of `event.client`, `event.request` and `event.user.app_metadata` when it does.
- **Duplicate in the DB connection.** If an Auth0 DB user with that email already exists (an earlier orphan, or the person used public sign-up before #41), `POST /users` fails with a conflict. The backend must **not** link that pre-existing account, because it did not create it and there is no ownership proof. It falls back to the existing nonce link flow, where the user logs in with that password. This response is shown only to the authenticated owner of that verified email, so it is not a public enumeration oracle. (INFERRED)
- **Orphans.** If the user never completes the reset, an Auth0 user with an unknown random password remains, already linked. That is harmless: "Forgot password" works later. A cleanup can delete `vocab_pending_link` users older than the ticket TTL, together with their `user_identity` row, using the existing `delete:users` client. (INFERRED)
- **M2M setup.** Use a Machine-to-Machine application authorized for the Auth0 Management API with `create:users`, `create:user_tickets` and the existing `delete:users`, plus `read:users` if lookup is needed. The current client-credentials code can be reused. (CONFIRMED scopes; INFERRED setup)

### Gaps

- No primary statement on whether Pre User Registration fires for `POST /api/v2/users`, or how to detect that origin in the event. Must test.
- Whether the password policy and Breached Password Detection run on the ticket page. Likely, as it is the password-reset flow (INFERRED), but not stated.
- Where the user lands after the reset in **New** Universal Login. `result_url` is classic-only. The docs point to customizing the password reset login route, with no detail found.
- Whether creating a ticket sends an email: sources conflict. Treat the ticket as URL-only and send it yourself, or use `/dbconnections/change_password`.

## Q2. Does a password set this way give normal Universal Login on the main connection? Downsides?

### Takeaway

Yes. After the reset, the account is an ordinary `auth0|…` user on `Username-Password-Authentication`, and the user signs in through Universal Login with email and password. The only downsides are operational: orphan users, email deliverability, and the email reset being the single point of proof.

### Cited Findings

- The user is created in the named DB connection with a password. A reset sets a new password for that DB user. — [post-users](https://auth0.com/docs/api/management/v2/users/post-users); [password-change](https://auth0.com/docs/authenticate/database-connections/password-change)
- Breached Password Detection applies to signup, login and password reset, so the chosen password is checked at reset and at each login (CONFIRMED for those flows). — [Breached Password Detection](https://auth0.com/docs/secure/attack-protection/breached-password-detection)
- The reset link in the email "is valid for one use only". The page states this for the email link, not explicitly for ticket URLs (PARTLY). — [password-change](https://auth0.com/docs/authenticate/database-connections/password-change)

### Inferences

- **Email verification is not a gate for login itself.** `email_verified` stays false unless `mark_email_as_verified` is used or a verification email is sent. If `/auth/sync` or a Post-Login Action requires `email_verified` for password users, set it through the ticket. (INFERRED)
- **The random initial password is never usable.** It is never stored or shown, so the user can only get in after mailbox proof. (INFERRED)

### Gaps

- Explicit doc that password complexity is enforced on the reset page in New Universal Login. Very likely, but not found.

## Q3. Alternative: Auth0 native account linking

### Takeaway

Linking merges the DB identity into the Google primary. The secondary user disappears from the users list, its metadata is discarded, and tokens carry the primary's `user_id`. That breaks the `(issuer, sub)`-per-identity model and ties the two logins' lifecycles together, which is why ADR 0004 avoids it.

### Cited Findings

- **Endpoint and scopes (CONFIRMED).** `POST /api/v2/users/{PRIMARY_ID}/identities` with `{provider, user_id}` or `{link_with: <secondary ID token>}`. Scope `update:users` server-side, or `update:current_user_identities` with a user token. The page notes "Every manual account link should prompt the user to enter credentials" and "Your tenant should request authentication for both accounts before linking occurs". — [Link user accounts](https://auth0.com/docs/manage-users/user-accounts/user-account-linking/link-user-accounts)
- **Effects (CONFIRMED).**
    - "The `user_id` and all other main profile properties continue to be those of the primary identity."
    - The secondary goes into `identities[]` with `profileData`.
    - "The secondary account is removed from the users list."
    - The secondary's `user_metadata` and `app_metadata` "are discarded".
    - "If you delete the primary account, the secondary account is deleted as well."
    - "Insecurely linking accounts can allow malicious actors to access legitimate user accounts."

    — [User account linking](https://auth0.com/docs/manage-users/user-accounts/user-account-linking)

- **"Auth0 does not automatically change to the correct primary user after Account Linking" (CONFIRMED).** Login-time linking therefore needs an Action that switches the user. — [Link user accounts](https://auth0.com/docs/manage-users/user-accounts/user-account-linking/link-user-accounts)
- **Tokens after linking carry the primary `user_id` (PARTLY, secondary).** — [Community: User ID used in token with linked accounts](https://community.auth0.com/t/user-id-used-in-token-with-linked-accounts/151633)

### Inferences

- **Effect on `sub`.** A password login would yield `sub = google-oauth2|…`, the primary's, so the backend never sees `auth0|…` as a sub. The `user_identity` row for the password login becomes meaningless. Unlinking or deleting the Google identity is coupled to the password login. Which identity is "primary" becomes a permanent decision. It also still needs a sign-up or creation step for the DB user first, so on its own it does not solve the #41 refusal. (INFERRED)

### Gaps

- No primary doc sentence that literally says "`sub` = primary `user_id`" after linking. Only the profile and secondary sources state it.

## Q4. Alternative: drop the sign-up refusal; refuse duplicates at first login (`account_link_required`)

### Takeaway

This is the simplest option and already built (`/auth/sync` returns `409 account_link_required`, used by the password-user runbook). With it, a Google user can create a password login through the public sign-up and then link it via the nonce flow. The cost is UX: an orphan Auth0 DB user is created before the refusal. The refusal at sign-up in #41 is itself an email-existence oracle on a public screen, which conflicts with the "no public endpoint reveals email existence" constraint.

### Cited Findings

- The Pre-registration Action can deny with `api.access.deny(reason, userMessage)`. The signup "will immediately stop" (CONFIRMED). — [Pre-user registration trigger](https://auth0.com/docs/customize/actions/explore-triggers/signup-and-login-triggers/pre-user-registration-trigger)
- The trigger runs only for Database and Passwordless connections, so it cannot stop Google duplicates anyway (CONFIRMED). — same source
- Repo: `docs/runbooks/auth0-password-user-linking.md` step 3. On first login, a known email with no identity returns `409 account_link_required` and writes nothing (local source).

### Inferences

- **Enumeration analysis.**
    - #41's sign-up refusal tells any anonymous visitor "this email has a Vocab account", unless the deny message is generic and identical to other failures. Even then, timing and behaviour differences leak (INFERRED).
    - The first-login refusal leaks only to someone who has completed sign-up for that email. If `/auth/sync` answers `account_link_required` only when `email_verified=true`, the leak goes only to the mailbox owner. Otherwise an attacker can create an unverified DB account with someone else's email and observe the 409. **Gate `account_link_required` on a verified email.** (INFERRED)
- **Cons.** Orphan DB users accumulate, and the user goes through sign-up, then a "link required" screen, then a login with the old method. Mitigate with clear copy and orphan cleanup. (INFERRED)

### Gaps

- None researched beyond the repo; this is a design choice.

## Q5. Alternative: passwordless email (OTP / magic link) as the second method

### Takeaway

This is feasible as a separate `email` connection whose users are distinct identities. It gives built-in mailbox proof on every login. Magic links are Classic-Login only, so with New Universal Login it must be an OTP code. It does not satisfy "Add a password", and Pre User Registration also runs for passwordless sign-up, so #41 would interfere in the same way.

### Cited Findings

- **Separate connection and identity (CONFIRMED).** Email passwordless is "treated as a unique connection type in your tenant, separate from other database, social, or enterprise connections". The identity is distinct even when the email matches, and the page recommends account linking to join them. — [Passwordless](https://auth0.com/docs/authenticate/passwordless)
- **"Magic links can only be implemented in Classic Login" (CONFIRMED).** — [Passwordless](https://auth0.com/docs/authenticate/passwordless)
- **Creation limits (CONFIRMED).** "You cannot create passwordless users from the Auth0 Dashboard". The Management API can create them (`connection: "email"`) "if signup is disabled". — [Passwordless](https://auth0.com/docs/authenticate/passwordless)
- **Pre User Registration runs for Passwordless connections (CONFIRMED).** — [Pre-user registration trigger](https://auth0.com/docs/customize/actions/explore-triggers/signup-and-login-triggers/pre-user-registration-trigger)

### Inferences

- **Same server-side pattern.** The backend creates the `email`-connection user via the Management API, links the returned sub, and lets the user log in with an OTP. No reset email is needed, because each login proves mailbox control. This avoids the "ticket URL leakage" risk entirely. (INFERRED)
- **Cost.** It is a second connection to enable on the app, and the user_id format is not confirmed in the page (believed to be `email|…`, UNCONFIRMED). (INFERRED)

### Gaps

- The exact `user_id` prefix for email-passwordless users, and whether Management API creation is allowed with signup enabled. The docs wording is ambiguous.

## Security comparison (who triggers / what proves control / enumeration)

| Approach                                            | Who can trigger                                                | Proof the person controls the email/login                                      | Enumeration risk                                                                                                                                     |
| --------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Mgmt API create + reset email (Q1)               | Authenticated User only (Settings, optional fresh `auth_time`) | Completing the emailed reset link; the Google session proves the Vocab account | None publicly. A 409 duplicate is visible only to the authenticated owner. The #41 Action needs a secret-authenticated exemption, not a public check |
| A′. Same, but ticket URL returned to the browser    | Authenticated User                                             | **None for the mailbox** (session only)                                        | None, but unsafe if the email can differ from the verified Google email                                                                              |
| B. Auth0 native linking                             | Server with `update:users`; needs both logins                  | Both credentials (Auth0 recommendation)                                        | None, but changes `sub` and couples lifecycles                                                                                                       |
| C. Drop #41; `account_link_required` at first login | Anyone can sign up                                             | Logging in with the existing method via the nonce link flow                    | Low if the 409 is gated on `email_verified`; #41 itself is a public oracle                                                                           |
| D. Passwordless OTP via Mgmt API                    | Authenticated User                                             | OTP to the mailbox at every login                                              | None publicly; #41 also runs for passwordless                                                                                                        |

All rows are INFERRED syntheses of the findings above.
