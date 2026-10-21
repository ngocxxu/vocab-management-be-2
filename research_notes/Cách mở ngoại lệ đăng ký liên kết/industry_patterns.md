# Industry patterns: adding a second sign-in method to a social-login account, and sign-up with an existing email

Research date: 2026-10-20. Help-centre pages change often; "[unverified]" marks claims from search-result summaries or community posts that I did not read on a primary page.

## Pattern A: "Set a password" for a social-only account (who does it, and does it use the public sign-up form?)

### Takeaway

None of the products checked adds a password through the public sign-up form. Consumer SaaS (Figma, Atlassian, Dropbox, Slack, Notion) reuses the existing **forgot/reset-password email**: if the inbox can receive the link, that proves ownership, and the password is attached to the existing account. Identity SDKs (Supabase, Firebase, Cognito) let an **already-authenticated session** attach a password with one call.

### Cited Findings

- **Figma (official help):** for Google SSO sign-ups the email and password are "Managed by Google". To set a Figma password: sign out, click Log in, choose "Reset password", open the link in the reset email, then enter a new password. After that you can log in with email + password and change the email. — [Figma Help: manage email/password](https://help.figma.com/hc/en-us/articles/360039820114)
- **Atlassian:** an Atlassian staff answer says a Google-only user can request a password reset email at id.atlassian.com/login/resetpassword even if they never set a password, and that this sets a password on the same account. [unverified: community post, not a current doc page] — [Atlassian Community thread](https://community.atlassian.com/forums/Watercooler-discussions/How-to-set-Atlassain-password-after-login-with-Google/td-p/905491); Atlassian docs also point to "Can't log in?" on the login screen for resetting the account password — [Atlassian: Require users to log in with Google](https://support.atlassian.com/security-and-access-policies/docs/require-users-to-log-in-with-google/)
- **Dropbox:** Google Sign-In requires the Google email to match the Dropbox account email — [Dropbox Help: Google Sign-In](https://help.dropbox.com/account-access/google-sign-in). Dropbox staff on the forum said a Google-only user should set a password from the security page, which **sends a reset-password link by email**. [unverified: older forum posts] — [Dropbox forum](https://www.dropboxforum.com/discussions/101001016/connect-with-google-account-but-nothing-happens/284820)
- **Slack:** the help article describes password-free sign-in with an emailed code, after which "you can set a new password for your account". To change an Apple relay email, a user must first request a password-reset email. [unverified: the Google-specific steps were truncated in the search result] — [Slack Help: Sign in to Slack](https://slack.com/help/articles/212681477)
- **Notion:** login methods are email code, email + password, Google/Apple, SAML, and passkeys. Google/Apple sign-in reaches the existing account only "as long as your Notion account email is the same as your Google email". Apple "Hide My Email" blocks linking to an existing account. Password management lives in account settings (separate article, not read). — [Notion Help: Log in & out](https://www.notion.com/help/log-in-and-out)
- **Canva:** "You can set a password in Settings later". Login options are Apple, Facebook, Google, and Email. Continue with Google creates a new account when none exists for that address. [unverified: from a search summary of the help page] — [Canva Help: sign up / log in](https://www.canva.com/help/article/sign-up-log-in)
- **GitHub (social login with Google GA July 2025, Apple Oct 2025):** docs recommend adding "a passkey or a password as an additional account recovery mechanism". An existing password account can "add your social login email to the account" so that social login can act as a first-factor replacement. Unlinking is on the email settings page. The docs do not give explicit steps for adding a password to a social-only account. — [GitHub Docs: About authentication](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/about-authentication-to-github); [Changelog: Google GA](https://github.blog/changelog/2025-07-15-social-login-with-google-is-now-generally-available/); [Changelog: Apple](https://github.blog/changelog/2025-10-07-github-now-supports-social-login-with-apple/)
- **Zoom:** a profile lists linked sign-in methods. Community answers say to add "Work Email" (email/password) alongside Google through the "Linking your Zoom account" article. Users report "already associated to an account" errors when they try to sign up again with the same Gmail address. [unverified: community posts only] — [Zoom Community: change login method](https://community.zoom.com/t5/Zoom-Meetings/Change-login-method/td-p/127365)
- **Supabase:** an OAuth-only user adds email/password by calling `updateUser({ password })` on the signed-in session. — [Supabase: Identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking)
- **Firebase:** a signed-in user (any provider) builds an `EmailAuthProvider` credential and calls `linkWithCredential`. The call fails if that credential is already linked to another user. — [Firebase: Link multiple auth providers](https://firebase.google.com/docs/auth/web/account-linking)
- **AWS Cognito:** an admin can call `AdminSetUserPassword` on a federated profile (status moves from EXTERNAL_PROVIDER to CONFIRMED), but AWS advises against it: "don't set passwords on federated user profiles. Instead, link users to local profiles with AdminLinkProviderForUser." — [Cognito: Linking federated users](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-identity-federation-consolidate-users.html)

### Inferences

- The reset-password-email route is common in consumer apps because it reuses existing code. The email link is the ownership proof, and no new linking UI or API is needed.
- In this route the password is set on the existing account, not created as a new user and merged. On Auth0, a database-connection password is a separate identity (separate user_id), so the equivalent needs either (a) creating the DB user server-side and linking it to the social primary while the user is signed in, or (b) the user signing up/in with the DB identity and then linking. Auth0 has no built-in "add password to a social user" call (inferred from the Auth0 linking docs model; not explicitly stated there).

### Gaps

- Spotify, Linear, and Vercel were not checked because I ran out of tool budget. Linear and Vercel are believed to be passwordless (email code/magic link + OAuth), so Pattern A may not apply to them [unverified].
- Exact current UI text for Notion's "set password" and GitHub's "add password to social-only account" was not found on a primary page.

## Pattern B: sign-up with an email that already has an account

### Takeaway

Three behaviours appear in practice. (1) **Explicit refusal** ("account already exists / already associated", reported for Zoom, and Auth0's default DB sign-up `user_exists`). (2) **Obfuscated/anti-enumeration response** (Supabase, Firebase with Email Enumeration Protection, OWASP's recommended "we sent you an email" message). (3) **Auto-link on verified email** at social login (Supabase, Clerk, Notion/Dropbox's "emails must match"). OWASP recommends (2).

### Cited Findings

- **OWASP:** registration should use the same generic approach as login. "This user ID is already in use." is the incorrect example. The correct example is "A link to activate your account has been emailed to the address provided." Response codes and timing can also leak existence. — [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- **OWASP (recovery):** correct message: "If that email address is in our database, we will send you an email to reset your password." — [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- **Supabase:** an email sign-up with an address already used for OAuth gets an obfuscated response, and no verification email is sent. — [Supabase: Identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking)
- **Firebase / Identity Platform:** Email Enumeration Protection is on by default for projects created after 15 Sep 2023. `fetchSignInMethodsForEmail` returns an empty list, and a wrong email or password returns a single generic invalid-credential error. [partly unverified: from search summary of Google Cloud docs] — [Google Cloud: Email enumeration protection](https://cloud.google.com/identity-platform/docs/admin/email-enumeration-protection); [Firebase Swift reference](https://firebase.google.com/docs/reference/swift/firebaseauth/api/reference/Classes/Auth)
- **Firebase (one-account-per-email):** signing in with a provider whose email belongs to another provider's account throws `auth/account-exists-with-different-credential`. The app should tell the user they already have an account with a different provider, have them sign in with it, then `linkWithCredential(pendingCred)`. — [Firebase: Google sign-in (web)](https://firebase.google.com/docs/auth/web/google-signin)
- **Auth0:** DB-connection sign-up returns a distinct `user_exists` error. Per the search summary, Auth0 staff called suppressing it a backlog item with no ETA, and the community workaround is to disable public sign-up and register through the Management API with a generic message. [unverified: the main thread now returns "post no longer exists" (checked 2026-10-20)] — [Auth0 Community: suppressing user_exists](https://community.auth0.com/t/surpressing-user-exists-response-on-signup/27597); [Auth0 Support: prevent sign-up when email exists (Action)](https://support.auth0.com/center/s/article/Prevent-Sign-Up-When-Email-Address-Already-Exists-Using-an-Action)
- **Clerk (auto-link):** if the email is verified both in Clerk and at the OAuth provider, Clerk links the accounts and signs the user in, "even … to password-protected accounts". If the OAuth email is unverified, Clerk requires email verification first. If the Clerk email is unverified, Clerk may require a password change before linking, to block takeover. — [Clerk: Account linking](https://clerk.com/docs/guides/configure/auth-strategies/social-connections/account-linking)
- **Supabase (auto-link):** identities with the same email are linked automatically. Linking to an unverified email is called insecure, so unconfirmed identities are removed on link. — [Supabase: Identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking)
- **Zoom:** users report "that gmail is already associated to an account" when they try to add or sign up with an email that already has a Google login. [unverified: community] — [Zoom Community](https://community.zoom.com/t5/Zoom-Meetings/Change-login-method/td-p/127365)

### Inferences

- An explicit refusal is the simplest UX but leaks existence. "We sent you an email" is OWASP-compliant, but it needs an email pipeline and a follow-up flow such as "here's how to sign in / set a password".
- On Auth0, getting OWASP-style anti-enumeration at sign-up appears to require a custom sign-up endpoint, because Universal Login's DB sign-up exposes `user_exists` [inferred from the unverified community reports].

### Gaps

- I did not confirm whether Auth0 has since shipped a built-in sign-up enumeration protection. Check the current Auth0 changelog or attack-protection docs.

## Pattern C: link-on-login (prove both identities, then link)

### Takeaway

Identity platforms (Auth0, Firebase, Supabase manual linking, Cognito) recommend that the user **authenticate with both identities** before linking. Verified-email matching alone is treated as insufficient by Auth0, and as sufficient only when both sides are verified by Clerk and Supabase.

### Cited Findings

- **Auth0:** identities are separate by default. "your tenant should request authentication for both accounts before linking occurs" and "every manual account link should prompt the user to enter credentials". There are two flows: user-initiated (a "Link accounts" button in the profile) and suggested (the app detects a same-email account and prompts the user, who must authenticate the other account). The primary account keeps `user_id`. Secondary metadata is not merged. Linking with ID tokens is being phased out in favour of access tokens. — [Auth0: User account linking](https://auth0.com/docs/manage-users/user-accounts/user-account-linking)
- **Auth0 Account Link Extension:** prompts after login when the email matches an account on another connection. It does not auto-link because "verified emails are not enough evidence". The user picks Continue, authenticates with the other provider, and the accounts are linked. Limits: no passwordless connections, and it is implemented as a **Rule** (a legacy mechanism). The page does not mention Actions or New Universal Login support. — [Auth0: Account Link Extension](https://auth0.com/docs/customize/extensions/account-link-extension)
- **Firebase:** catch `account-exists-with-different-credential`, store the pending credential (session storage in redirect mode), have the user sign in with the existing provider, then call `linkWithCredential`. — [Firebase: Google sign-in (web)](https://firebase.google.com/docs/auth/web/google-signin)
- **Supabase manual linking (beta):** a signed-in user calls `linkIdentity()` and completes an OAuth redirect, which can link a different email. It must be enabled in config. Unlinking requires at least two identities. — [Supabase: Identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking)
- **Cognito:** `AdminLinkProviderForUser` must be used "only … with external IdPs and provider attributes that have been trusted by the application owner". It can link up to 5 federated users per profile, typically in a Pre sign-up Lambda. — [Cognito: Linking federated users](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-identity-federation-consolidate-users.html)
- **GitHub:** an existing password account adds the social login email to link it; unlinking is in email settings. — [GitHub Docs](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/about-authentication-to-github)

### Inferences

- Link-on-login has the most moving parts: it needs pending-state storage across a redirect (a nonce or pending credential), a confirm screen, a second authentication, and a merge/link call. It is also the most secure, because it proves control of both identities.

### Gaps

- I did not verify whether Auth0 currently provides an Actions-based or New Universal Login replacement for the Account Link Extension.

## Which pattern needs the fewest moving parts

### Takeaway

Ranked from fewest to most moving parts (my inference from the sources above):

1. **Set password from a signed-in session.** Supabase `updateUser`, Firebase `linkWithCredential(EmailAuthProvider)`. On Auth0 the equivalent is: a signed-in user submits a password, the backend creates a DB-connection user with the same email (mark it verified, because the social session already proved the email) and links it to the primary with the Management API. The public sign-up form is never involved.
2. **Reset-password-email route** (Figma, Atlassian, Dropbox). This reuses the existing forgot-password flow, so no linking UI is needed. On Auth0 this only works if a DB identity already exists or is created first, because Auth0's password reset applies only to database connections [inferred].
3. **Link-on-login with a confirm screen** (Auth0 suggested linking or the extension, Firebase pending credential). This needs the most state and UI.

For sign-up with an existing email, the simplest compliant choice is the OWASP generic message ("check your email"), paired with an email that tells the owner how to sign in or set a password. Explicit refusal is simpler but enables enumeration.

### Cited Findings

- Supabase `updateUser({ password })` adds a password to an OAuth user with one call — [Supabase](https://supabase.com/docs/guides/auth/auth-identity-linking)
- Firebase `linkWithCredential` only requires a signed-in user plus the new credential — [Firebase](https://firebase.google.com/docs/auth/web/account-linking)
- Figma and Atlassian use the reset-password email to set a password for Google sign-ups — [Figma](https://help.figma.com/hc/en-us/articles/360039820114); [Atlassian Community](https://community.atlassian.com/forums/Watercooler-discussions/How-to-set-Atlassain-password-after-login-with-Google/td-p/905491)
- Auth0 requires authenticating both accounts before linking — [Auth0](https://auth0.com/docs/manage-users/user-accounts/user-account-linking)
- OWASP generic registration message — [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)

### Inferences

- For a small Auth0 app, "set a password while signed in", with the backend creating and linking the DB identity, avoids both the public sign-up form and the `user_exists` enumeration problem. It also meets Auth0's "authenticate both" rule in spirit: the social session proves the primary account, and the user chooses the new password. Whether this satisfies Auth0's guidance exactly is my interpretation, not an Auth0 statement.

### Gaps

- I found no Auth0 doc that explicitly covers "server creates a DB user for a signed-in social user and links it". Confirm against the Auth0 Management API docs (`POST /api/v2/users`, `POST /api/v2/users/{id}/identities`) and the email-verified semantics before relying on it.
