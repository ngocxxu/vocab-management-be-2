# Pre User Registration: can the Action tell a link-flow signup from a plain one?

Research date: 2026-10-18. Context: `docs/adr/0004-user-initiated-account-link.md`. A password signup whose email already belongs to a User must be refused, except when it starts from the signed-in link flow.

Primary sources only: Auth0 docs (auth0.com/docs) and Auth0 support articles (support.auth0.com, first-party but a support site). Pages were read through a fetch tool that summarises content, so quotes are short. Re-check the exact wording on the page before quoting it in an ADR. Anything not confirmed on a page is marked **unconfirmed**. Community posts are not used as evidence; where one is mentioned, it is only a lead to test.

## Short answer

1. **A flag on `/authorize` cannot be read as a plain flag.** The Pre User Registration event has no query field. Auth0 support says reading query string parameters in this Action "is not supported" (last updated 2025-09-10). The only documented route is a body hidden field (`event.request.body['ulp-...']`, support article updated 2026-03-09). The end user controls that value, and Auth0 says the Action "must validate it against an external API or signature before trusting it."
2. **Deny: yes.** `api.access.deny(reason, userMessage)` stops the signup flow, and no further Actions run.
3. **Lookup by email: yes.** `GET /api/v2/users-by-email` needs `read:users`. An Action can call it with a Machine-to-Machine application's credentials kept in `event.secrets`. Management API calls from Actions are rate-limited, and the trigger must finish within 20 seconds.
4. **Client id: visible, but not a gate by itself.** `event.client.client_id` is documented, and Auth0 publishes a "disable sign-ups for one application" pattern that compares it. The signup endpoint takes `client_id` from the caller, so a direct request can name any client id. Auth0's own article says that a front-end restriction does not stop a direct API call.
5. **Recommendation:** gate on the connection, not on the client id or a flag. Use a dedicated database connection for the link flow. The Action refuses cross-connection duplicates only when `event.connection.name` is the main connection, so the main connection cannot be exempted by anything the caller sends. The ADR 0004 proof in the backend remains the security boundary.

## Why the Action is needed at all

- "Auth0 treats all identities as separate by default." and "There is no automatic merging of user profiles with associated identities." (https://auth0.com/docs/manage-users/user-accounts/user-account-linking). A password signup with an email that exists on another connection (Google, for example) creates a second user unless something refuses it.
- Same-connection duplicates are already refused by Auth0. The signup reference lists "409 Conflict, user already exists." (https://auth0.com/docs/api/authentication/signup/create-a-new-user). The Action only has to cover the cross-connection case.

## 1. Which event fields carry request-level data

Pre User Registration event object: https://auth0.com/docs/customize/actions/explore-triggers/signup-and-login-triggers/pre-user-registration-trigger/pre-user-registration-event-object

| Field                                                                       | Documented content                                                                                                                                                                                             | Caller-controlled?                                                   |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `event.request.ip`, `user_agent`, `language`, `hostname`, `method`, `geoip` | Originating IP, `User-Agent` header, browser language, host, HTTP method, GeoIP data                                                                                                                           | Yes (headers and client IP)                                          |
| `event.request.body`                                                        | "The body of the POST request." Documented as available in the PreUserRegistration Action. Keys are not listed. The page's example shows an empty object. A community thread reports an empty body (not used). | Yes                                                                  |
| `event.request.query`                                                       | **Absent from this event.** It is present in the Post Login event: "The query string parameters sent to the authorization request."                                                                            | n/a                                                                  |
| `event.client`                                                              | `client_id` ("The client id of the application the user is logging in to"), `name`, `metadata`                                                                                                                 | Yes. The caller sends `client_id` on the signup request (section 4). |
| `event.connection`                                                          | `id`, `name`, `strategy`, `metadata`                                                                                                                                                                           | Yes. The caller names the connection.                                |
| `event.transaction` (optional)                                              | Standard authorize values: `acr_values`, `login_hint`, `prompt`, `redirect_uri`, `response_mode`, `response_type`, `state`, `ui_locales`, `correlation_id`, `requested_scopes`, `locale`                       | Yes                                                                  |
| `event.user`                                                                | `email`, `username`, `name`, `phone_number`, metadata objects. No `user_id`, because the user does not exist yet.                                                                                              | Yes                                                                  |
| `event.secrets`                                                             | "Secret values securely associated with this Action."                                                                                                                                                          | No                                                                   |
| `event.tenant`, `custom_domain`, `security_context`, `authentication`       | Tenant id, custom domain, JA3/JA4 fingerprints (Cloudflare only), Akamai risk data (early access)                                                                                                              | Mixed                                                                |

Answers to the specific questions:

- No field carries arbitrary `/authorize` parameters. `transaction` holds only the standard names above.
- `state` and `correlation_id` are the only documented, caller-set fields that could be reused as a carrier. Their documented purposes are CSRF protection and tracing. Whether `transaction` is populated for a signup POST has not been tested (**unconfirmed**).
- The page lists no `organization` or `stats` field for this trigger. Not needed for this question.

### Custom values on `/authorize` (support articles)

- "Accessing Querystring Parameters in a Pre-User Registration Action" (updated 2025-09-10): "Currently, accessing query string parameters in the Pre-User Registration Action is not supported." The Action "does not have access to this value."
- "Passing custom parameters to pre-user-registration actions" (updated 2026-03-09): "By default, custom query parameters passed via the Auth0 SDK are not accessible within the Pre-User Registration Action." The workaround: send the parameter with an `ext-` prefix. Universal Login Partials inject it into a hidden `ulp-` field of the signup form, and the Action reads `event.request.body['ulp-my_custom_param']`. Prerequisites: Universal Login with the Classic "Customise Login Page" toggle disabled, a custom domain (Partials need one), and Database connections only. The article's caveat: "Query parameters can be easily manipulated by an end-user in their browser's address bar."
- "Pass Additional Parameters to the Universal Login URL" (support): `ext-` parameters are read by Universal Login templates through `transaction.params`. It does not mention Actions, so it does not help here.

Consequence: any flag that reaches the Action is caller-editable. It is usable only with a signature or a server-side check. A plain `link=1` is forgeable by anyone who edits the URL or posts the form.

## 2. Can the Action deny a signup?

- `api.access.deny(reason, userMessage)` (API object page: https://auth0.com/docs/customize/actions/reference/pre-user-registration/pre-user-registration-api-object). "Denies registration. `reason` is an internal reason that appears in tenant logs. `userMessage` is a human-readable explanation." Quoted: "The signup flow will immediately stop following the completion of this action and no further Actions will be executed." The page says the message "may be presented directly in end-user interfaces", so display is not guaranteed.
- `api.validation.error(errorCode, errorMessage)` also blocks signup on this page.
- Throwing an uncaught error: the API object page does not say what happens (**unconfirmed**). Use `api.access.deny`.
- The Auth0 "disable sign-ups" article calls `api.access.deny('signup_not_allowed', '<message>')` from this trigger.

## 3. Can the Action look up an existing user by email?

- Endpoint: `GET /api/v2/users-by-email?email=...`. Reference: https://auth0.com/docs/api/management/v2/users-by-email/get-users-by-email. Overview: https://auth0.com/docs/manage-users/user-search/retrieve-users-with-get-users-by-email-endpoint.
- Scope: `read:users`. The 403 response reads "Insufficient scope; expected any of: read:users." The overview describes the endpoint as "immediately consistent".
- Matching: "Email address to search for (case-sensitive)." With Auth0 as the IdP, emails are stored in lowercase, so lowercase the input before the call.
- Response: an array of user objects. Each has an `identities` array ("Array of user identity objects when accounts are linked"). The field names inside each identity (for example `connection`) were not fetched (**unconfirmed**).
- Calling it from an Action (support article "Using the Management API in Actions": https://support.auth0.com/center/s/article/using-the-management-api-in-actions):
    1. Create a Machine-to-Machine application for the Action and authorize it for the Management API.
    2. Store `domain`, `clientId` and `clientSecret` in the Action's secrets (`event.secrets`).
    3. Add the `auth0` npm module as a dependency in the Action editor.
    4. Build `new ManagementClient({ domain: event.secrets.domain, clientId: event.secrets.clientId, clientSecret: event.secrets.clientSecret })`.
       The article does not name the scope. Use `read:users` from the reference.
- SDK method name for users-by-email: **unconfirmed** for the pinned SDK version. Check it against the installed package.
- Limits:
    - Trigger execution: "Each execution of a trigger must complete in 20 seconds or less or the processing will end in an error." (https://auth0.com/docs/customize/actions/limitations)
    - Management API from Actions: "Calls to the Auth0 Management API and User Metadata updates made from within Actions are subject to rate limits." Same page.
    - Secrets: keys up to 128 characters, values up to 4096 characters. Same page.
    - A 429 response carries `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset` (users-by-email reference).
    - Figures: the Essentials/Professional matrix (https://auth0.com/docs/troubleshoot/customer-support/operational-policies/rate-limit-policy/rate-limit-configurations/essentials-professional-b2b) lists "Read Users" GET at burst 40 and sustained 500 per minute, and "All other Endpoints Combined" at burst 10 and sustained 150 per minute. The matrix does not say whether `users-by-email` is in "Read Users" (**unconfirmed**). On this plan it falls in one of those two buckets. Free, Private Cloud and Enterprise figures were not confirmed on primary pages, and community figures conflict, so none are used here.
    - At this app's scale (about 8 users), a 150-per-minute bucket is not a practical limit. Read the `X-RateLimit-*` headers on a test tenant to confirm.
- Meaning of "belongs to a User": the lookup returns Auth0 users with that email in the tenant. It does not return our `user_identity` rows. It over-approximates. An Auth0 user the backend never mapped (for example a pre-registration on another connection) would also block the signup. Decide whether that is acceptable. It is a policy gap, not a platform limit.

## 4. Is the client id visible, and is a dedicated application a documented pattern?

- Visible: yes. `event.client.client_id` is documented on the Pre User Registration event page.
- Documented pattern: Auth0 support article "Disable Sign-ups for a Specific Application" (https://support.auth0.com/center/s/article/disable-sign-ups-for-a-specific-application). Setup: several applications share one database connection, and sign-ups must be blocked for one of them. The Pre User Registration Action compares `event.client.client_id` with a hard-coded id and calls `api.access.deny('signup_not_allowed', '...')`.
- The same article says the connection-level Disable Sign-ups setting "applies globally to all applications using it", and presents separate connections as "the most robust architectural solution" (extracted by the fetch tool; re-check the wording).
- The article's own caveat: "hiding the button on the front end does not prevent a user from crafting a direct API call to create a user."
- Why the client id is not a gate: `POST /dbconnections/signup` takes `client_id` as a body parameter. "If omitted, the request falls back to the tenant's global client ID." The reference lists no client secret or token for this endpoint (https://auth0.com/docs/api/authentication/signup/create-a-new-user). So a direct request can send the link application's public client id, and the Action then sees that id in `event.client.client_id`.
- Whether Auth0 refuses a connection that the named client is not enabled for, on this endpoint, is **unconfirmed**. The reference does not say, and the application-connections page does not say either (https://auth0.com/docs/get-started/applications/update-application-connections). The dashboard does have a per-application Connections tab (https://auth0.com/docs/configure/applications/set-up-database-connections). A support article, "The connection is not enabled" (seen in search results, not fetched), describes an error when a connection has no applications switched on.
- Consequence: if the Action exempted by client id, a direct call with `client_id=<link app>` and `connection=<main DB>` would create an exempt password identity on the main connection. Do not use the client id as the gate.

### Tradeoffs of a dedicated application

- Auth0: a second application (an SPA needs no secret). It has its own Allowed Callback URLs and logout URLs, and its connections are set on its Connections tab.
- Backend: ADR 0004 step 3 checks the second login's ID-token `aud` against the FE client id. A dedicated link application makes that `aud` the link client id. The change is to accept the link client id for the second login only. The main login must still require the FE client id.
- Session: the link login must not replace the FE's session cookies. ADR 0004 already says this.
- Audit: the link application's name appears in `event.client` and in the tenant logs.

## 5. Options compared

| #   | Mechanism                                                                                                                          | Works?                                                                                                                                                                       | Security property                                                                                                                                                                                                                                                                                   | Verdict                                                                                                  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| A   | Plain flag on `/authorize`, read via `event.request.query`                                                                         | No. Not supported in Pre User Registration (support, 2025-09-10).                                                                                                            | None                                                                                                                                                                                                                                                                                                | Reject                                                                                                   |
| B   | `ext-` parameter, injected into a hidden `ulp-` field, read via `event.request.body`                                               | Yes, per the support article (2026-03-09), with prerequisites (custom domain, Partials, Classic login disabled, Database connections only)                                   | Caller-editable. Safe only with a signature that the Action checks, and single-use use needs a backend call or a store.                                                                                                                                                                             | Viable but heavy. Not chosen.                                                                            |
| C   | Gate on `event.client.client_id` (dedicated application), Auth0's documented pattern                                               | Yes                                                                                                                                                                          | Caller-set `client_id` on the signup call. A direct request can exempt the main connection.                                                                                                                                                                                                         | Reject as the sole gate                                                                                  |
| D   | Dedicated database connection for the link flow. The Action refuses on the main connection only, gated by `event.connection.name`. | Yes. `event.connection.name` is documented. Auth0's support article calls separate connections the most robust option for per-application sign-up control.                   | The main connection cannot be exempted by anything the caller sends. Residual: if per-application enforcement is missing on the signup call, a caller can name the link connection and create an unverified password identity there. This is a denial-of-service issue, not a takeover (see below). | **Chosen**                                                                                               |
| E   | Single-use signed link ticket, checked by the Action through a backend call (secret in `event.secrets`)                            | Yes in principle. Needs B's carrier, a fail-closed call inside 20 seconds, and a second single-use value separate from the ADR's nonce (the nonce is consumed at link time). | Strongest binding to a signed-in User                                                                                                                                                                                                                                                               | Fallback if D's residual matters                                                                         |
| F   | Keep refusing all cross-connection duplicates. Refuse in the backend after the Auth0 user already exists.                          | Yes (no Action exemption)                                                                                                                                                    | Simplest                                                                                                                                                                                                                                                                                            | Fallback. Breaks the "at sign-up time" requirement, and leaves an Auth0 user created before the refusal. |
| G   | Create the link identity with `POST /api/v2/users`, which skips the signup call                                                    | **Unconfirmed** whether this trigger runs for API-created users. Not found on a primary page.                                                                                | n/a                                                                                                                                                                                                                                                                                                 | Test before relying on it                                                                                |

## 6. Recommended design (D)

The mechanism, named precisely: **a dedicated database connection used only by the link flow, distinguished in the Pre User Registration Action by `event.connection.name`.**

1. **Tenant.** Add a second database connection, for example `Username-Password-Link`. Leave the main `Username-Password-Authentication` connection unchanged. Enable the link connection only for the link application (for example `vocab-link-spa`), on the application's Connections tab. Enforcement at the signup API is **unconfirmed** (test below).
2. **Action** on the Pre User Registration trigger:
    - Allow-list the main connection name. If `event.connection.name` is not the main connection, return. This skips the link connection and any other connection.
    - Lowercase `event.user.email`. Call `GET /api/v2/users-by-email` through a Management API client built from `event.secrets`.
    - Deny with `api.access.deny('account_exists', '<message>')` when a returned user exists that is not only on the link connection. The "only on the link connection" test depends on identity field names that are **unconfirmed**.
    - Fail closed on an error or a timeout, with a retry message. Set a short HTTP timeout so the call finishes well inside 20 seconds. Failing closed is a design choice here.
    - Scope: password signups only. The trigger also runs for passwordless registrations (trigger page). Decide whether they are in scope before writing the check.
3. **Backend.** ADR 0004's proof stays as it is: the session, the nonce, `auth_time` within 5 minutes, the ID-token signature, and a verified email on the second login. Never link by email. If the dedicated link application is used, accept its client id as the `aud` for the second login only.
4. **Do not use** `client_id`, a query flag, or a body field to make the decision.

Residual risks and why they are acceptable:

- Pre-registration on the link connection (only if per-application enforcement is missing). An attacker can create a password identity with an arbitrary email there. It cannot be linked: the backend requires a verified email on the second login, the requesting User's session, a fresh `auth_time`, and the nonce. It never links by email. The effect is a denial of service on that email's link path. The victim recovers with a password reset on that identity, which mails the victim's own address.
- The Action's lookup can see link-connection users, so filter them out as in step 2, once the identity field names are confirmed. Otherwise a stray link-connection user could block a normal signup.

## 7. Tests to run on a dev tenant before adopting D

Each item is **unconfirmed** until run:

1. A test Action that logs `JSON.stringify(event)` for Pre User Registration. Confirm that there is no `request.query`, what `request.body` contains on the hosted signup POST, whether `transaction` is populated, and what `event.client.client_id` is for a direct `POST /dbconnections/signup` with a different `client_id`.
2. A direct `POST /dbconnections/signup` with `connection` set to the link connection and `client_id` set to the main application. Does Auth0 refuse it? This tests per-application enforcement.
3. Whether `POST /api/v2/users` runs the Action (option G).
4. The field names inside `identities` in a `users-by-email` response.
5. The `X-RateLimit-*` headers on a test call, to see which bucket applies to this plan.
6. The `users-by-email` method name in the pinned `auth0` SDK.
7. The Action's behaviour when the Management API call times out.

## 8. Notes for ADR 0004

- ADR 0004 says the refusal happens "at sign-up". Under D it happens in the Action, before the Auth0 user is created. Keep that wording.
- ADR 0004 step 3 pins `aud` to the FE client id. If the dedicated link application is adopted, step 3 must accept the link client id for the second login only.

## Sources

- Pre User Registration trigger: https://auth0.com/docs/customize/actions/explore-triggers/signup-and-login-triggers/pre-user-registration-trigger
- Pre User Registration event object: https://auth0.com/docs/customize/actions/explore-triggers/signup-and-login-triggers/pre-user-registration-trigger/pre-user-registration-event-object
- Pre User Registration API object: https://auth0.com/docs/customize/actions/reference/pre-user-registration/pre-user-registration-api-object
- Post Login event object (`request.query`): https://auth0.com/docs/customize/actions/explore-triggers/signup-and-login-triggers/login-trigger/post-login-event-object
- Actions limitations (20 s, rate limits, secrets): https://auth0.com/docs/customize/actions/limitations
- Get users by email (reference): https://auth0.com/docs/api/management/v2/users-by-email/get-users-by-email
- Get users by email (overview): https://auth0.com/docs/manage-users/user-search/retrieve-users-with-get-users-by-email-endpoint
- Create a new user (signup reference): https://auth0.com/docs/api/authentication/signup/create-a-new-user
- Rate limit configurations (Essentials/Professional): https://auth0.com/docs/troubleshoot/customer-support/operational-policies/rate-limit-policy/rate-limit-configurations/essentials-professional-b2b
- Application connections: https://auth0.com/docs/get-started/applications/update-application-connections
- User account linking: https://auth0.com/docs/manage-users/user-accounts/user-account-linking
- Support: Disable Sign-ups for a Specific Application: https://support.auth0.com/center/s/article/disable-sign-ups-for-a-specific-application
- Support: Using the Management API in Actions: https://support.auth0.com/center/s/article/using-the-management-api-in-actions
- Support: Accessing Querystring Parameters in a Pre-User Registration Action: https://support.auth0.com/center/s/article/Accessing-Querystring-Parameters-in-a-Pre-User-Registration-Action
- Support: Passing custom parameters to pre-user-registration actions: https://support.auth0.com/center/s/article/passing-custom-parameters-to-pre-user-registration-actions
- Support: Pass Additional Parameters to the Universal Login URL: https://support.auth0.com/center/s/article/pass-additional-parameter-to-the-universal-login-url
