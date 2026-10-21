# Post-reset success page and Change Password email: Auth0 defaults and customisation

Research date: 2026-10-20. Method: primary Auth0 docs were fetched and summarised by WebFetch, so quoted wording should be re-checked against the live page before it is copied. Community threads are labelled as community and are not primary sources. Two primary URLs did not yield usable content: https://auth0.com/docs/customize/login-pages/universal-login/customize-login-text-prompts.md returned HTTP 404, and https://auth0.com/docs/brand-and-customize/text-customization-new-universal-login returned the "Customize" index page instead of the custom-text article. The custom-text article is therefore unverified.

## Q1. What does the default post-reset success page say, and does it link back to the app?

### Takeaway

The default title is reported as "Password Changed!" (community only). The default body wording was not found in any source. The primary docs describe the success screen but mention no button. Community reports say a "Back to [Application Name]" button appears only when the application's Application Login URI is set and the reset request is tied to the correct client; a Management API reset with the wrong client_id has been reported to hide the button.

### Cited Findings

- The ACUL docs describe the `reset-password-success` screen as the one that "confirms to the user that their password has been successfully reset." They mention no buttons or links back to the app or login, and quote no default text. [Auth0 docs: ACUL ResetPasswordSuccess](https://auth0.com/docs/libraries/acul/js-sdk/Screens/classes/ResetPasswordSuccess.md)
- Default title: a community reply says to change the `eventTitle` text "from 'Password Changed!'" to other text. [Community: Customize password reset confirmation page (May 2023)](https://community.auth0.com/t/customize-password-reset-confirmation-page/106932)
- Default button: community describes a navigation button labelled "Back to [Application Name]" that links to the URL in the Application Login URI setting. [Community: Customize message for navigation button (Aug 2022)](https://community.auth0.com/t/customize-message-for-navigation-button-on-password-reset-page/88688)
- Missing button, Management API reset (Dec 2024): the poster saved an Application Login URI but saw no button. The thread records the root cause as a wrong `AUTH0_APP_CLIENT_ID` env var used as the client_id on the ticket request; the poster closed it as user error. A responder also suggested a `custom_login_page_preview` HTML property, which forces classic login and hides the button; that did not apply to this poster. [Community: No "Back to app" button on Password-Reset-Success screen (Dec 2024)](https://community.auth0.com/t/no-back-to-app-button-on-password-reset-success-screen-even-though-application-login-uri-is-filled-out/162015)
- Conflicting community claims (from search-result summaries, threads not fetched): one moderator said a reset started through the Management API shows no return button; another reported that adding the application's client ID to the password-ticket request brought the button back and sent users to that app's default login route. Both are community reports and are not resolved by primary docs. [Community: Missing 'Back To App' button on Reset Password Success screens](https://community.auth0.com/t/missing-back-to-app-button-on-reset-password-success-screens-universal-login/53542)
- Tenant fallback (search-result summary of the same community threads, not fetched): when the button has no app-level target, it reportedly falls back to the tenant-level Login URI (Dashboard > Settings > Advanced > Tenant Login URI). One team with six applications said a single tenant-wide URL did not work for them. [Community: Missing 'Back To App' button on Reset Password Success screens](https://community.auth0.com/t/missing-back-to-app-button-on-reset-password-success-screens-universal-login/53542)

### Inferences

- The only return-to-app control on the default success screen is the button, and its target comes from the application's Application Login URI (with the tenant Login URI as a possible fallback). Email wording does not control it.
- A Management API reset must carry the correct client_id, or the button may be missing. This rests on one community thread and is not confirmed by primary docs.

### Gaps

- The exact default body text of the success screen was not found in any fetched source. The wording "Your password has been changed successfully." in the research brief is unverified.
- No primary doc was retrieved that states when the button appears under New Universal Login versus Classic Login.

## Q2. What is the default Change Password email body, and which template variables exist?

### Takeaway

The docs list two Change Password templates, "Change password link email" and "Change password code email". Both are sent when a user requests a password change. The docs do not quote a default body. Only a few variables are documented, and they are not confirmed for these templates: `{{ user.name }}` and `application.name` appear as examples, `user.email` is documented only for the Passwordless OTP template, and `{{ url }}` is not confirmed anywhere.

### Cited Findings

- The email template list has 11 entries, including "Change password code email" and "Change password link email". Both are triggered when "A user requests a password change." The link email contains "A link to the password reset page." The code email contains "A link to the password reset page and a code to use on that page." [Auth0 docs: Email templates](https://auth0.com/docs/customize/email/email-templates.md); [Auth0 docs: Email template descriptions](https://auth0.com/docs/customize/email/email-templates/email-template-descriptions.md)
- The 11 listed templates include no post-reset "password changed" notification email. [Auth0 docs: Email templates](https://auth0.com/docs/customize/email/email-templates.md)
- "Each template comes with a default message body which you can modify or discard entirely." The default text is not quoted. [Auth0 docs: Customize email templates](https://auth0.com/docs/customize/email/email-templates/customize-email-templates.md)
- Settings documented for the Change Password (link) template: From Address (sender address; blank falls back to the email provider's From value; SPF and DKIM are needed for signed sending); Subject (blank means Auth0 generates one from the email type); Message (the HTML body); URL lifetime (default 432,000 seconds, five days); Redirect To (a URL the user is redirected to "after completing the action at an included link"; Auth0 appends `success` and `message` query parameters). [Auth0 docs: Customize email templates](https://auth0.com/docs/customize/email/email-templates/customize-email-templates.md)
- Liquid is supported in the From address, Subject, Redirect To and Message fields. The only variables shown on that page are `application.name` (in a Redirect To example; "encoded for security"), `request_language` and `user_metadata.lang`. [Auth0 docs: Customize email templates](https://auth0.com/docs/customize/email/email-templates/customize-email-templates.md)
- `{{ user.name }}` is shown as a Liquid example on the templates page. `user.email` is available only in the Passwordless OTP email template, per the docs. [Auth0 docs: Email templates](https://auth0.com/docs/customize/email/email-templates.md)
- Customisation requires an external SMTP provider: "Email template customization is not available when using the built-in email provider." [Auth0 docs: Email templates](https://auth0.com/docs/customize/email/email-templates.md)
- Community: after one edit, a user could not restore the built-in Change Password template. The original was visible only as screenshots, and the Reset button stopped working. Auth0 staff passed the feedback to the product team, which logged a backlog item. [Community: Reset "Change Password" email template](https://community.auth0.com/t/reset-change-password-email-template/86690)

### Inferences

- The Change Password email is sent before the reset happens. Its wording can set expectations ("after you reset, return to the app and sign in"), but it cannot describe the post-reset state. Post-reset guidance has to come from the success screen, the button target, or a redirect.
- Per the list on the docs page, Auth0 sends no post-reset notification email, so the success screen is the only post-reset surface in the default set of templates.

### Gaps

- No source quotes the default Change Password body. The variables `{{ url }}` (reset link), `{{ user.email }}` and `{{ application.clientID }}` are not confirmed for the Change Password templates.
- The docs do not state how a tenant chooses between the link email and the code email.

## Q3. Can the success-page text be customised with the Universal Login text editor or Prompts, what are the key names, and is this possible without Enterprise?

### Takeaway

Community replies from 2022 and 2023 describe the keys: prompt `reset-password`, screen `reset-password-success`, title key `eventTitle`, and button key `buttonText`. These can be edited in the Dashboard under Custom Text or through the Management API. No plan restriction on custom text appears in any source I fetched. The primary custom-text article was not retrieved, so the key names and plan availability are unverified in primary docs.

### Cited Findings

- Dashboard path (community reply, May 16 2023): Branding > Universal Login > Advanced Options > "Custom Text" tab. Choose `reset-password` in the Prompt dropdown, then `reset-password-success` in the Screen dropdown, and change `eventTitle` from "Password Changed!". [Community: Customize password reset confirmation page](https://community.auth0.com/t/customize-password-reset-confirmation-page/106932)
- Management API (community reply, Aug 15 2022): `PUT https://{your domain}/api/v2/prompts/reset-password/custom-text/en` with the body `{"reset-password-success": {"buttonText": "Back to Login"}}`. The reply also says the Application Login URI must point to the login page. [Community: Customize message for navigation button](https://community.auth0.com/t/customize-message-for-navigation-button-on-password-reset-page/88688)
- Endpoint and scope: `PUT /api/v2/prompts/{prompt}/custom-text/{language}` requires the `update:prompts` scope, and the body is keyed by screen name and then by text key. Reported in a search summary citing the Auth0 text-customisation article; the fetched version of that URL was an index page, so this is unverified. [Auth0 docs: Customize Universal Login text elements (search result, not retrieved)](https://auth0.com/docs/brand-and-customize/text-customization-new-universal-login)
- Personalisation is not possible: the `user` variable is available only on pages rendered after authentication, so a generic title such as "Success!" was suggested in place of user-specific text. [Community: Customize password reset confirmation page](https://community.auth0.com/t/customize-password-reset-confirmation-page/106932)
- The ACUL SDK provides a `ResetPasswordSuccess` class for a fully custom success screen. It exposes `branding`, `client`, `organization`, `user` and `transaction`, plus `changeLanguage()` and `getErrors()`. The docs state no plan restriction. [Auth0 docs: ACUL ResetPasswordSuccess](https://auth0.com/docs/libraries/acul/js-sdk/Screens/classes/ResetPasswordSuccess.md)

### Inferences

- The key names come from community replies dated 2022 and 2023. They should be checked against the live Custom Text tab before use, because the current prompt and key list was not retrieved.
- No plan restriction on custom text was found. This is an inference, not a verified fact, that custom text is available on non-Enterprise tenants. The only plan restriction verified in primary docs is the Redirect To one on the email template (Q5).

### Gaps

- The primary custom-text article was not retrieved (404 and index page), so the official key list is unverified.
- Whether a `description` key (or any other key) exists on `reset-password-success` is not verified.
- A search-result summary says the classic-login success message is a plain string with no HTML or images. No thread URL was retained, so this is unverified.

## Q4. Community or docs examples of customised post-reset messages that tell the user to return to the app and sign in

### Takeaway

The examples found are short: a button label changed to "Back to Login" (2022), a generic "Success!" title suggested in place of "Password Changed!" (2023), and a 2023 request for "account activated" wording for invited users, which was not answered. No example of body copy telling the user to return to the app and sign in was found.

### Cited Findings

- Button label changed from "Back to [Application Name]" to "Back to Login" via `buttonText` (Aug 2022). The button target still comes from the Application Login URI. [Community: Customize message for navigation button](https://community.auth0.com/t/customize-message-for-navigation-button-on-password-reset-page/88688)
- Title changed to a generic "Success!" because user-specific text is not available on this prompt. [Community: Customize password reset confirmation page](https://community.auth0.com/t/customize-password-reset-confirmation-page/106932)
- A 2023 poster who onboarded invited users wanted to skip the confirmation page, or change "password changed" to something like "account activated". The thread offered no skip option and no accepted answer. [Community: Customize password reset confirmation page](https://community.auth0.com/t/customize-password-reset-confirmation-page/106932)
- A community moderator suggested adding the login URL to the Redirect To field of the Change Password email template to send users back to the login page after a reset (search-result summary; thread not fetched). That is the Redirect To setting restricted in Q5. [Community: Missing 'Back To App' button on Reset Password Success screens](https://community.auth0.com/t/missing-back-to-app-button-on-reset-password-success-screens-universal-login/53542)

### Inferences

- Customers mostly change the button label, not the body copy. The button target (Application Login URI) affects what users see more than the wording does.

### Gaps

- No public example of a full sentence such as "Your password has been reset. Return to the app and sign in." was found in the docs or in the community threads reviewed.

## Q5. Redirect To constraint: what is verifiable

### Takeaway

Redirect To on the Change Password template is restricted, but the restriction is narrower than "Enterprise-only". The docs say tenants created on or after May 5, 2026 with a non-enterprise subscription cannot customise the field; tenants created before that date are exempt. Whether a given tenant is affected depends on its creation date and plan, which this research did not check. Do not plan around Redirect To as a fix without checking the tenant.

### Cited Findings

- Verbatim from the docs: "Tenants created on or after May 5, 2026 with a non-enterprise subscription cannot customize the Redirect To field. Tenants created before that date are exempt." [Auth0 docs: Customize email templates](https://auth0.com/docs/customize/email/email-templates/customize-email-templates.md)
- Affected tenants receive the error "403 — Customizations for resultUrl are not allowed for non-enterprise tenants". The docs say to "contact your Auth0 account team about upgrading your subscription." [Auth0 docs: Customize email templates](https://auth0.com/docs/customize/email/email-templates/customize-email-templates.md)
- Redirect To "sets a URL where a user is redirected after completing the action at an included link." Auth0 appends `success` and `message` query parameters. [Auth0 docs: Customize email templates](https://auth0.com/docs/customize/email/email-templates/customize-email-templates.md)
- The same page notes that "Universal Login currently ignores the value of the Redirect To field in the Password Reset template." That note concerns the Password Reset template, not Change Password, so it does not establish how Change Password Redirect To behaves. [Auth0 docs: Customize email templates](https://auth0.com/docs/customize/email/email-templates/customize-email-templates.md)

### Inferences

- The restriction is date-based as well as plan-based. Tenants created before May 5, 2026 are exempt, and the docs do not say whether that exemption holds after a plan change.
- The docs say the redirect happens "after completing the action at an included link". For the link email, whether that action is the reset form or something else is not stated.

### Gaps

- The docs do not define "enterprise subscription" beyond this sentence, so the plan names that count as non-enterprise are not stated.
- Whether a Change Password Redirect To value lands users back in the app after a successful reset (as opposed to after clicking the link) is not confirmed by any fetched source.
