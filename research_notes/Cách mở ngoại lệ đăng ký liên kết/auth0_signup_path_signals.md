# Auth0 sign-up path: which signals can mark a sign-up as a trusted "link" sign-up

Research date: 2026-10-20. Builds on `docs/research/auth0-pre-registration-link-flag.md` (2026-10-18), called "the earlier note" below. Pages were read through a fetch tool that summarises content, so quotes are short. Re-check exact wording before putting a quote in an ADR.

Labels: **CONFIRMED** (stated on a primary Auth0 page: auth0.com/docs or support.auth0.com), **PARTLY** (primary source covers part of it), **INFERRED** (my reasoning from confirmed facts), **UNCONFIRMED** (no primary source found; community only, or nothing). Community posts are secondary and labelled as such.

Verdict on the earlier note: all of its findings still hold. Two additions change the option space: (1) `event.request.body` carrying `ulp-` fields is now documented on the main Auth0 docs page for signup prompt partials, not only in a support article; (2) `event.transaction` holds several `/authorize` values that a backend-signed token could ride in, but whether it is populated on a Universal Login sign-up is still untested.

## Q1. Exact fields of the Pre User Registration event, and what reaches `request.body` / `transaction`

### Takeaway

The event has `request.body` (populated for this trigger) but no `request.query`. Custom signup-form fields named with a `ulp-` prefix reach `event.request.body`. `event.transaction` is optional and lists only standard `/authorize` values (`state`, `login_hint`, `ui_locales`, `acr_values`, `redirect_uri`, `requested_scopes`, `correlation_id`, ...), not arbitrary or `ext-` parameters.

### Cited Findings

- CONFIRMED. Top-level fields: `authentication` (optional, Akamai risk data), `client` (optional: `client_id`, `name`, `metadata`), `connection` (required: `id`, `name`, `strategy`, `metadata`), `custom_domain` (optional), `request` (required), `secrets` (required), `security_context` (optional, JA3/JA4), `tenant` (required), `transaction` (optional), `user` (required). No `organization`, no `stats`. — [Pre User Registration event object](https://auth0.com/docs/customize/actions/explore-triggers/signup-and-login-triggers/pre-user-registration-trigger/pre-user-registration-event-object)
- CONFIRMED. `event.request` fields: `body` ("The body of the POST request", populated only for refresh token, Client Credential Exchange and PreUserRegistration flows), `geoip`, `hostname`, `ip`, `language`, `method`, `user_agent`. There is no `query` field. — [same page](https://auth0.com/docs/customize/actions/explore-triggers/signup-and-login-triggers/pre-user-registration-trigger/pre-user-registration-event-object)
- CONFIRMED. `event.transaction` (optional) fields: `acr_values`, `locale`, `login_hint`, `prompt`, `protocol`, `redirect_uri`, `requested_scopes`, `response_mode`, `response_type`, `state`, `ui_locales`, `correlation_id`. The page gives no rule for when the object is populated. — [same page](https://auth0.com/docs/customize/actions/explore-triggers/signup-and-login-triggers/pre-user-registration-trigger/pre-user-registration-event-object)
- CONFIRMED. `event.user` has `email`, `username`, `name`, `given_name`, `family_name`, `nickname`, `picture`, `phone_number`, `user_metadata`, `app_metadata`. No `user_id` and no `identities`. — [same page](https://auth0.com/docs/customize/actions/explore-triggers/signup-and-login-triggers/pre-user-registration-trigger/pre-user-registration-event-object)
- CONFIRMED. Custom signup fields added with Universal Login partials must use the `ulp-` prefix "to ensure the data is available to Actions", and the Action reads them from `event.request.body` (example `ulp-full-name`). For database connections the data is available in `pre-user-registration`. Prerequisites: a Custom Domain, Universal Login for all prompts, a Custom Page Template. A validation error from the trigger "prevents the user from registering". — [Customize Signup and Login Prompts](https://auth0.com/docs/customize/login-pages/universal-login/customize-signup-and-login-prompts)
- CONFIRMED. For passwordless connections, signup data is available only in `post-login`; social/enterprise get only login-prompt data in `post-login`. — [same page](https://auth0.com/docs/customize/login-pages/universal-login/customize-signup-and-login-prompts)
- CONFIRMED (support, updated 2026-03-09). An `ext-` parameter sent on `/authorize` reaches the Action only via a partial: the partial renders a text input (hidden with CSS, because `type="hidden"` inputs are stripped) named `ulp-my_custom_param` with value `transaction.params['ext-my_custom_param']`; the Action reads `event.request.body['ulp-my_custom_param']`. Use the `signup-id` prompt's `form-content-end` partial for identifier-first, or the `signup` prompt's for identifier+password. Database connections only; Classic "Customise Login Page" must be off; custom domain required. Values "can be easily manipulated" by the end user; sensitive values must be validated "against an external API or signature". — [Passing custom parameters to pre-user-registration actions](https://support.auth0.com/center/s/article/passing-custom-parameters-to-pre-user-registration-actions)
- CONFIRMED (support, updated 2025-09-10). Reading query string parameters in Pre User Registration "is not supported". — [Accessing Querystring Parameters in a Pre-User Registration Action](https://support.auth0.com/center/s/article/Accessing-Querystring-Parameters-in-a-Pre-User-Registration-Action)
- Secondary (search summary of a support article, not fetched in full): a plain hidden field in a page template is not submitted with the form; JavaScript or the partial approach is needed. — [How to Add Hidden Fields and Custom JavaScript to the Auth0 Sign-Up Form](https://support.auth0.com/center/s/article/how-to-add-hidden-fields-and-custom-javascript-to-the-auth0-sign-up-form)
- Secondary (community, unresolved): a partial accepted by the API did not render on the signup page despite a custom domain and template. — [Custom partial is not displayed](https://community.auth0.com/t/custom-partial-is-not-displayed/196758)

### Inferences

- INFERRED. `event.transaction.*` values are fixed at `/authorize`; the end user cannot edit them after that step, but anyone can start their own `/authorize` with any values. So they are no more trustworthy than a `ulp-` field unless the value is signed. Their advantage over `ulp-` is that they need no custom domain or partial. Their drawback: every field has a protocol meaning (`state` is owned by the SDK for CSRF, `login_hint` prefills the email box, `ui_locales` drives language, `acr_values` can request MFA). `correlation_id` is the only field whose documented purpose (log correlation) leaves room for an opaque value.
- INFERRED. A direct `POST /dbconnections/signup` has no `/authorize` transaction, so a design that requires a valid signed value in `transaction` or in a `ulp-` field fails closed for direct API calls. This is the useful property: the exception cannot be reached without the hosted page plus a token only our backend can mint.

### Gaps

- UNCONFIRMED whether `event.transaction` is populated when the sign-up happens on New Universal Login (the docs mark it optional with no rule). Needs the logging Action test from the earlier note.
- UNCONFIRMED whether `transaction.correlation_id` can be set by an SDK through `authorizationParams` and what length/charset Auth0 accepts. No primary page found.
- UNCONFIRMED whether a direct `/dbconnections/signup` call can include extra `ulp-*` keys that reach `event.request.body`. If it can, the value must be signed (it would be anyway).
- Whether Custom Domains are available on this tenant's plan was not checked.

## Q2. Can a backend-signed value (HMAC/JWT checked with `event.secrets`) be carried into the Action?

### Takeaway

Yes in principle, by two carriers: an `ext-` param copied into a `ulp-` field (documented end-to-end by Auth0 support, with Auth0 itself recommending a signature check), or a standard `/authorize` field that lands in `event.transaction` (documented field list, untested population). No Auth0 page shows `ext-` params reaching the Action any other way.

### Cited Findings

- CONFIRMED. Secrets are available as `event.secrets`; key max 128 chars, value max 4096 chars. — [Actions limitations](https://auth0.com/docs/customize/actions/limitations)
- CONFIRMED. Auth0 recommends validating `ext-`-carried values "against an external API or signature" in the Action. — [support article](https://support.auth0.com/center/s/article/passing-custom-parameters-to-pre-user-registration-actions)
- CONFIRMED. Actions can depend on npm modules (e.g. a JWT library) — [Actions limitations](https://auth0.com/docs/customize/actions/limitations); "To use an npm library like axios, you must add the library to the Action as a dependency." — [Pre User Registration trigger](https://auth0.com/docs/customize/actions/explore-triggers/signup-and-login-triggers/pre-user-registration-trigger)
- CONFIRMED (Post-Login only, for comparison). Auth0 ships a signed-token helper only for redirects: `api.redirect.encodeToken({payload, secret, expiresInSeconds})` / `validateToken`. Not available in Pre User Registration. — [Post-login API object](https://auth0.com/docs/customize/actions/explore-triggers/signup-and-login-triggers/login-trigger/post-login-api-object)

### Inferences

- INFERRED design: the backend mints a short-lived token for a signed-in User who clicked "Add a password": `HMAC(secret, email_lowercased | exp | jti)` or a JWT with those claims. The Action allows the duplicate only if the signature verifies, `exp` is in the future, and the signed email equals `event.user.email` (lowercased). Binding to email means a stolen or replayed token can only create a password login for that same email, which the backend still refuses to link without the ADR 0004 proof (session + nonce + fresh ID token). This removes the "issue #41" bypass for everyone without a token.
- INFERRED. Single use is not needed for safety if the token is email-bound and short-lived, because the backend link step is the real boundary. If single use is wanted, the Action must call the backend (Q3).
- INFERRED. The token must not be the ADR 0004 link nonce itself: the nonce is consumed at link time and putting it in the browser URL widens its exposure. Use a separate token.
- INFERRED. Putting the email in the token does not leak existence: the backend mints it only for the signed-in User's own email, and it reveals nothing about other users.

### Gaps

- No primary Auth0 example of HMAC/JWT verification in Pre User Registration was found; the pattern is assembled from the documented pieces above.

## Q3. Can the Action call our backend or the Management API? Limits, timeouts, fail-open/closed

### Takeaway

Yes. Outbound HTTP is allowed (Auth0's own example uses axios) and the Management API can be called with M2M credentials in secrets. The trigger must finish in 20 seconds and is blocking. Auth0 documents no fail-open behaviour: an error ends the execution in an error, and the example code fails closed with `api.validation.error`.

### Cited Findings

- CONFIRMED. "Each execution of a trigger must complete in 20 seconds or less or the processing will end in an error." Outbound HTTP requests without a timeout are named as a risk. Outbound calls originate from published Auth0 IP addresses. Management API calls from Actions are rate limited. — [Actions limitations](https://auth0.com/docs/customize/actions/limitations)
- CONFIRMED. Pre User Registration Actions are "blocking (synchronous)". The trigger page's example calls a remote service with `REQUEST_TIMEOUT = 2000` ("Example timeout") and on failure calls `api.validation.error('custom_error', ...)`. — [Pre User Registration trigger](https://auth0.com/docs/customize/actions/explore-triggers/signup-and-login-triggers/pre-user-registration-trigger)
- CONFIRMED (from earlier note). `api.access.deny(reason, userMessage)` stops signup; `users-by-email` needs `read:users`, is case-sensitive; rate-limit buckets on Essentials/Professional. — see earlier note's sources.

### Inferences

- INFERRED. Calling the backend lets the Action ask "does this email belong to a Vocab User?" against `user_identity` rather than Auth0's user store, closing the over-approximation noted earlier. That endpoint must be private to the Action (shared secret in `event.secrets`, optionally IP allow-list of Auth0 outbound IPs), otherwise it becomes the email-existence oracle the constraints forbid.
- INFERRED. Whether an uncaught exception or a 20 s timeout blocks the signup or lets it through is not documented; write the Action so every failure path calls `api.access.deny`/`api.validation.error` explicitly (fail closed).

### Gaps

- UNCONFIRMED: platform behaviour on uncaught exception/timeout in this trigger.
- Rate limit figures for the Free plan were not confirmed on a primary page.

## Q4. Does Auth0 enforce per-application enabled connections on `/dbconnections/signup` and Universal Login signup?

### Takeaway

Not documented. The signup reference names no such check, and the "connection is not enabled" support article describes the error only for a connection with no applications at all.

### Cited Findings

- CONFIRMED. `/dbconnections/signup` body: `client_id` (optional), `email`, `password` (required), `connection` (required), `username`, `phone_number`, name fields, `picture`, `user_metadata`. No client secret. Documented errors: 400 and 409 only. `connection` is described as "The name of the database configured to your client." — [Signup reference](https://auth0.com/docs/api/authentication/signup/create-a-new-user)
- CONFIRMED (support, updated 2026-04-30). "The connection is not enabled" occurs "because a connection was created without enabling any applications for it." It does not name the endpoint or the case of a specific client being disabled. — [Auth0 Error "The connection is not enabled"](https://support.auth0.com/center/s/article/auth0-error-the-connection-is-not-enabled)
- Secondary (community): "connection is disabled" when the client application has no association with the database connection; fixed by enabling the app on the connection. Mixed reports. — [community thread](https://community.auth0.com/t/connection-is-disabled-when-creating-a-user/8400)

### Inferences

- INFERRED. The phrase "configured to your client" hints at a per-client check, but this is not proof. Any design that relies on "only the link app can sign up on connection X" must be tested (earlier note, test 2). The signed-token design in Q2 does not depend on it.

### Gaps

- UNCONFIRMED: per-client enforcement on both the API endpoint and the hosted signup page.

## Q5. Does `POST /api/v2/users` (Management API) trigger Pre User Registration?

### Takeaway

No primary source says either way. The trigger docs say only "through a Database or Passwordless connection". A community answer (poster's role not shown) says Dashboard-created users do run it.

### Cited Findings

- CONFIRMED. The trigger "runs when a user attempts to register through a Database or Passwordless connection"; the page does not mention the Management API. — [Pre User Registration trigger](https://auth0.com/docs/customize/actions/explore-triggers/signup-and-login-triggers/pre-user-registration-trigger)
- Secondary (community, rueben.tiow, 2023-09-05, staff status not shown on page): "Yes, the Pre-User Registration Action will run when you create users using the Auth0 Dashboard." Management API not addressed. — [community thread](https://community.auth0.com/t/are-pre-user-registration-actions-run-when-new-users-are-created-through-the-auth0-ui/115480)
- Secondary (community): for Management API / Dashboard creation, `event.client` is filled with tenant defaults (e.g. "API Explorer Application"). — [community thread](https://community.auth0.com/t/pre-user-registration-when-is-optional-event-client-not-defined/92870)
- Secondary (community): Pre/Post User Registration do not run for social connections. — [community thread](https://community.auth0.com/t/pre-user-registration-and-post-user-registration-are-not-triggered-when-sign-up-with-social-connections/130980)

### Inferences

- INFERRED. The Dashboard creates users through the Management API, so if the Dashboard case runs the Action the API case likely does too. If so, "backend creates the password user via Management API" does not bypass the Action, and the Action would need to recognise backend-created users (e.g. by `event.client.client_id` of the backend M2M app — which here is trustworthy, because Management API calls need an M2M token).
- INFERRED. Backend creation would also mean the backend sets the user's password, which breaks the "user sets their own password on Auth0's page" flow; the user would have to go through a password-reset email. Not attractive.

### Gaps

- UNCONFIRMED for the Management API path. Test on the dev tenant.

## Q6. Forms for Actions / Post-Login alternatives

### Takeaway

Forms (`api.prompt.render`) run only in post-login and post-challenge, not in Pre User Registration. A Post-Login check could refuse at first login, but by then the Auth0 user already exists, so it does not meet "refuse at sign-up".

### Cited Findings

- CONFIRMED. `api.prompt.render()` is available in post-login and post-challenge (password reset). Form data returns in `event.prompt` to `onContinuePostLogin`. — [Render forms using Actions](https://auth0.com/docs/customize/forms/render)
- Secondary (community moderator): Forms "is currently only available for the Post-Login flow, you cannot use it for the Pre User Registration flow". — [community thread](https://community.auth0.com/t/typeerror-on-pre-user-registration-cannot-read-properties-of-undefined-reading-render/140653)
- CONFIRMED. Post-Login has `event.request.query` ("The query string parameters sent to the authorization request") and `event.stats.logins_count`. — [Post-login event object](https://auth0.com/docs/customize/actions/explore-triggers/signup-and-login-triggers/login-trigger/post-login-event-object)
- CONFIRMED. Post-Login `api.access.deny(reason)` stops login; side effects already requested in the Action still apply. — [Post-login API object](https://auth0.com/docs/customize/actions/explore-triggers/signup-and-login-triggers/login-trigger/post-login-api-object)

### Inferences

- INFERRED. Post-Login can read a signed token directly from `event.request.query` (no partials, no custom domain), so a "first login on the password connection with a duplicate email and no valid token → deny (and flag/delete)" rule is easy to build. Costs: the Auth0 user is created first (email squatting in Auth0 stays possible; cleanup needs a Management API delete), and the user sees the error after submitting the signup form and being logged in, not as a signup-form error. Use only as a fallback or as defence in depth.

### Gaps

- Whether the error message from a Post-Login deny is shown on the Universal Login page or returned to the app as `error=access_denied` was not confirmed on a primary page.

## Q7. Universal Login with two database connections enabled for one app

### Takeaway

Universal Login uses one database connection per transaction: the first enabled one by default, or the one named in the `connection` param on `/authorize`. There is no automatic per-user choice.

### Cited Findings

- CONFIRMED (support, updated 2025-09-17). With two or more database connections enabled, login without a `connection` param can fail with "Wrong email or password" because Auth0 tries only the first available database connection; pass `connection` on `/authorize` to choose; both must be enabled on the application. Alternative: one database connection per app, separate users with Roles/Organizations. — [Enabling Multiple Database Connections for a Single Application](https://support.auth0.com/center/s/article/Enabling-Multiple-Database-Connections-for-a-Single-Application)
- Secondary (community): Auth0 does not pick the right database for the user; passing `connection` hides the other (enterprise/social) buttons on the page. — [community thread](https://community.auth0.com/t/choose-a-default-database-connection-during-an-authorization-request-without-affecting-enterprise-connections/186633)
- Secondary (community): signup can disappear from Universal Login when another enabled connection has "Disable Sign Ups" on. — [community thread](https://community.auth0.com/t/no-signup-on-new-universal-login/70823)

### Inferences

- INFERRED. For the "dedicated link connection" design (earlier note, option D), the "Add a password" flow sends `connection=<link connection>` and `screen_hint=signup`; normal login keeps `connection` unset (or set to the main one). Enabling both on one app risks the first-enabled default picking the wrong one, so a separate link application is cleaner.
- INFERRED. "Flexible Connections" as a named Auth0 feature was not found; the relevant concept is the `connection` param.

### Gaps

- Identifier-first behaviour with two database connections was not found in primary docs.

## Summary table of carriers

| #   | Mechanism                                                                                               | Reaches Pre User Registration?       | Trustworthy?                                                                       | Status                                                                   |
| --- | ------------------------------------------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1   | `request.query` flag                                                                                    | No                                   | n/a                                                                                | CONFIRMED not supported                                                  |
| 2   | `ext-` param → partial → `ulp-` body field, value signed by backend                                     | Yes                                  | Yes if HMAC/JWT bound to email + exp is verified in Action                         | CONFIRMED carrier; signing INFERRED; needs custom domain + page template |
| 3   | Signed value in an `/authorize` field surfaced in `event.transaction` (best candidate `correlation_id`) | Field listed; population UNCONFIRMED | Yes if signed                                                                      | Test first                                                               |
| 4   | `event.client.client_id`                                                                                | Yes                                  | No (caller-chosen on `/dbconnections/signup`)                                      | CONFIRMED                                                                |
| 5   | `event.connection.name` (dedicated link connection)                                                     | Yes                                  | Exempt path reachable by anyone unless per-client enforcement exists (UNCONFIRMED) | Earlier note's choice                                                    |
| 6   | Action calls backend (secret-authenticated) to check `user_identity` and/or a single-use ticket         | Yes (outbound HTTP)                  | Yes; must fail closed in code                                                      | CONFIRMED possible; 20 s limit                                           |
| 7   | Management API user creation by backend                                                                 | UNCONFIRMED if trigger runs          | Client id of M2M app is trustworthy                                                | Test; poor UX                                                            |
| 8   | Post-Login deny (with `request.query` token) / Forms                                                    | Post-Login only                      | Yes                                                                                | CONFIRMED; user already created → not "at sign-up"                       |
