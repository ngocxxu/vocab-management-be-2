# Account linking when the same email signs in with a different method: GitHub, Meta, TikTok

Research date: 2026-10-17. Primary sources only (vendor docs and vendor help centers). Items not confirmed from a primary source are marked **unconfirmed**.

## Question

When a user first registers with one login method (email + password, or one social provider) and later signs in with a different method that carries the same email, do the vendors:

1. auto-link the accounts,
2. show an error, or
3. require the user to sign in with the existing method and then connect the new one?

For each vendor the answer covers (1) signup collision, (2) social login whose email already belongs to another account, (3) whether linking is user-initiated from a signed-in session, and (4) whether email verification is required before linking.

## Short answer

- **GitHub.** Documents a one-account-per-email rule and an "email already in use" error. Does not document what happens when a Google or Apple sign-up or sign-in carries an email already on another account (unconfirmed). Linking a social login to an existing password account is an account action the user takes (documented, with the auth state implied rather than spelled out). GitHub never documents auto-linking.
- **Meta.** As the identity provider, Facebook documents no merge of accounts ("we don't have a way to merge multiple accounts") and tells users to remove the email from the other account. As the relying party, Meta's Facebook Login guidance tells the app to merge automatically when the email matches an existing app account, to create a new user when it does not match, and to offer an explicit merge when the emails differ. The decision belongs to the app, not to Meta. The merge guide itself was not directly fetchable; its content comes from search excerpts.
- **TikTok.** Documents a one-email-per-account rule (help FAQ, search excerpt only). Login Kit, as documented, gives a relying app no email or phone scope, so a same-email match cannot be performed through the documented API. Social sign-up collisions, linking from a signed-in session, and verification before linking are **unconfirmed**.

## Method and evidence grades

| Grade       | Meaning                                                                                                                                                                           |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Confirmed   | Text read directly from the primary page (fetched).                                                                                                                               |
| Excerpt     | Text seen only in search-tool output drawn from a primary page. The direct fetch failed (HTTP 404 or title-only). Treat as partially confirmed and re-check before relying on it. |
| Unconfirmed | No primary source found that answers the question.                                                                                                                                |

Notes on the evidence:

- The GitHub page titled "Connecting a social account" does not exist in the docs under that title. The closest pages are "About authentication to GitHub" (has a social login section, used here) and "REST API endpoints for social accounts" (profile social links only, not sign-in, so not used for linking).
- The Meta guide "Using with Existing Login Systems" (`developers.facebook.com/docs/facebook-login/multiple-providers`) returned HTTP 404 for every variant tried (`?locale=en_GB`, `?locale=en_US`, no locale, trailing slash). Its content is taken from search excerpts and is graded Excerpt.
- The TikTok help FAQ on email and phone number returned only its title on direct fetch. Its content is taken from search excerpts and is graded Excerpt.
- A search summary claimed that unverified GitHub email addresses block creating repositories and generating personal access tokens. The GitHub verification page does not say this; it says "Having an unverified email address does not affect most actions you can take on GitHub." The claim is rejected and not used.

---

## GitHub

GitHub is an identity provider here (sign-up with Google or Apple, and OAuth apps that sign users in with GitHub).

### (1) Same-email collision at signup

- **Confirmed.** "An email address can only be associated with one GitHub account at a time." An "email already in use" error "means the email address is already linked to another GitHub account." The owner must "Sign in to the account currently linked to the email address and remove it from that account." If the owner has no access, the documented route is a password reset email to recover the account.
    - Source: https://docs.github.com/en/account-and-profile/how-tos/email-preferences/troubleshooting-adding-an-email
- **Confirmed.** Sign-up supports Google and Apple as social providers. "using social login will result in creating a new GitHub account" on iOS, and the page says this applies even when "Hide My Email addresses" is enabled for the Apple account.
    - Source: https://docs.github.com/en/account-and-profile/how-tos/account-management/creating-an-account-on-github
- **Confirmed.** For enterprise managed users, "You can't sign up for a personal account with an email address that's already verified for a managed user account."
    - Source: https://docs.github.com/en/account-and-profile/how-tos/account-management/creating-an-account-on-github
- **Unconfirmed.** The outcome when a Google or Apple sign-up presents an email already attached to another GitHub account. The sign-up page does not describe it, and the one-account rule is stated only for email addresses in account settings.

### (2) Social login whose email already belongs to another account

- **Unconfirmed for the sign-in flow.** The fetched authentication page does not directly address this. Its only related guidance is for locked accounts: an email tied to a locked account can be unlinked, and "The unlinked email address can then be linked to a new or existing account."
    - Sources: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/about-authentication-to-github ; https://docs.github.com/en/account-and-profile/how-tos/account-management/unlinking-your-email-address-from-a-locked-account
- **Confirmed.** Unlinking from a locked account requires 2FA ("You will be prompted for your 2FA credentials") and "will permanently break the link between the account and the linked email address."
    - Source: https://docs.github.com/en/account-and-profile/how-tos/account-management/unlinking-your-email-address-from-a-locked-account

### (3) User-initiated linking from an authenticated session

- **Confirmed (documented action, auth state implied).** "If you have an existing account created with a password, you can add your social login email to the account. This allows you to use your social login identity as a first-factor (password) replacement when you sign in to GitHub."
    - Source: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/about-authentication-to-github
    - The fetched text does not say the user must be signed in to the existing account, but "add ... to the account" describes an action on an existing account.
- **Excerpt.** The social identities can be removed on the GitHub email settings page. Not confirmed on a fetched page.
- **No auto-linking documented.** None of the fetched GitHub pages describes GitHub merging accounts automatically.

### (4) Email verification before linking

- **Confirmed.** GitHub sends a verification email: "GitHub will send you an email with a link in it." Verification is not a precondition for most actions: "Having an unverified email address does not affect most actions you can take on GitHub."
    - Source: https://docs.github.com/en/account-and-profile/how-tos/email-preferences/verifying-your-email-address
- **Confirmed.** GitHub recommends verification to reduce the risk of exploitation of third-party GitHub Apps and OAuth apps.
    - Source: https://docs.github.com/en/account-and-profile/concepts/email-addresses
- **Confirmed.** Enterprise managed users: "email addresses are no longer automatically verified."
    - Source: https://docs.github.com/en/account-and-profile/concepts/email-addresses
- **Unconfirmed.** Whether a social login email must be verified before it is linked to a password account.

### OAuth apps that sign users in with GitHub (relevant to "social login" from the relying side)

- **Confirmed.** The user is sent to GitHub, returns to the app, and the app calls the API with its access token. The docs do not say GitHub links the user to any other account. The `login` parameter "Suggests a specific account to use for signing in and authorizing the app."
    - Source: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
- **Confirmed.** `user:email` "Grants read access to a user's email addresses."
    - Source: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps
- **Confirmed (schema only).** The REST "list email addresses for the authenticated user" response has a required boolean `verified` field, so the relying app can check verification itself. The schema does not explain it.
    - Source: https://docs.github.com/en/rest/users/emails
- **Unconfirmed.** Whether the `user:email` scope returns verified and unverified addresses alike. The scope page does not say.
- **Not documented.** How an OAuth app should match or merge accounts by email. The GitHub docs are silent.

---

## Meta (Facebook and Facebook Login)

Meta is both an identity provider (Facebook Login for apps) and a platform with its own accounts (Facebook, Accounts Center).

### (1) Same-email collision at Facebook signup

- **Confirmed.** Facebook lets a person log in with "any email address that's listed on your Facebook account." This describes login identifiers, not an exclusivity rule.
    - Source: https://en-gb.facebook.com/help/185285184853471
- **Confirmed.** Facebook does not merge accounts: "we don't have a way to merge multiple accounts." Users are told to move information into one account and delete the duplicate.
    - Source: https://www.facebook.com/help/203498356357867?locale=en_US (Merge Facebook profiles or pages)
- **Excerpt.** Facebook's "Email address already in use" help form says that if a Facebook account is associated with your email or phone number and you do not own that account, you should use the form to report it. Direct fetch returned HTTP 404 for the URL tried.
    - Source: https://en-gb.facebook.com/help/contact/255904741169641
- **Unconfirmed.** The exact message shown at signup when the email is already used. The help text is limited to the excerpt above.

### (2) Facebook Login where the email already belongs to another app account

Meta's documentation places this decision in the relying app.

- **Confirmed.** "Where an email address you get from Facebook Login matches one already in your system" the app can "log that person into their existing account without additional passwords."
    - Source: https://developers.facebook.com/documentation/facebook-login/overview
- **Confirmed (permission).** The `email` permission "allows your app to read a person's primary email address." Its allowed use is "letting them log into your app with the email address associated with their Facebook profile." Apps may request email without App Review.
    - Sources: https://developers.facebook.com/documentation/development/permissions ; https://developers.facebook.com/documentation/facebook-login/overview
- **Excerpt (guide not directly fetched).** The "Using with Existing Login Systems" guide says the app should search its own database for an account with the same email. If one exists, merge the Facebook identifiers into it. If none exists, treat the person as a new user. It assumes the email the user first supplied matches the primary Facebook email.
    - Source: https://developers.facebook.com/docs/facebook-login/multiple-providers?locale=en_GB (HTTP 404 on direct fetch)
- **Confirmed (test scenario only).** The testing docs list a case: "Someone logs in with Facebook after previously logging in via a non-Facebook flow with the same email address." The page gives the steps but not the expected merge behavior.
    - Source: https://developers.facebook.com/docs/facebook-login/testing-your-login-flow?locale=en_GB

### (3) User-initiated linking from a signed-in session

- **Excerpt.** When the Facebook email differs from the app's stored email, the guide suggests an explicit "Account Merging" option where the user picks the two accounts to combine. The excerpt does not say whether the existing account must be re-authenticated first. **Unconfirmed** on that point.
    - Source: https://developers.facebook.com/docs/facebook-login/multiple-providers?locale=en_GB (excerpt only)
- **Confirmed (Meta account level).** Accounts Center lets users add accounts: "You can add Facebook, Instagram, WhatsApp and Meta accounts to the same Accounts Centre." This is a user-initiated account grouping, not an email-based login link.
    - Source: https://en-gb.facebook.com/help/1026219344754266

### (4) Email verification before linking

- **Excerpt.** The guide recommends verifying the email Facebook supplied "before a user adds a password to a Facebook-created account," by sending a verification email. The excerpt does not list verification as a precondition for the email-match merge at login.
    - Source: https://developers.facebook.com/docs/facebook-login/multiple-providers?locale=en_GB (excerpt only)
- **Confirmed (rationale).** The overview says "A validated email address means you're able to reach that person to re-engage them at a later date."
    - Source: https://developers.facebook.com/documentation/facebook-login/overview

---

## TikTok

TikTok is an identity provider through Login Kit (relying apps) and also has its own accounts with a help center.

### (1) Same-email collision at signup

- **Excerpt (help FAQ).** "Since your email address can only be associated with a single TikTok account, you can't use the same email address to create additional or multiple accounts." The advice is to use a different address or change the email on the existing account. An email is reserved for 30 days after the account is deleted.
    - Source: https://support.tiktok.com/en/log-in-troubleshoot/log-in/email-and-phone-number (search excerpt). The redirect target `https://www.tiktok.com/support/faq_detail?id=7581820709597583928` returned only its title on direct fetch.
- **Unconfirmed.** What TikTok does when a sign-up with Google, Apple or Facebook presents an email already tied to a TikTok account. No official help article was found, and unofficial pages were not used.

### (2) Social login whose email already belongs to another account

- **Confirmed (relying-app view).** Login Kit: "...your application will be able to request access to basic user data such as display name and avatar." The overview does not mention email. "TikTok prompts them to log in / sign up, then asks for consent to your requested scopes."
    - Source: https://developers.tiktok.com/docs/en/login-kit-overview
    - Source: https://developers.tiktok.com/doc/login-kit-web ("They are then prompted to log in or sign up for TikTok.")
- **Confirmed (scope reference).** The scope reference lists 21 scopes. None relates to email address or phone number. The basic scope `user.info.basic` "Reads basic profile details such as avatar and display name."
    - Source: https://developers.tiktok.com/docs/en/tiktok-api-scopes
- **Inference (from the two points above).** With the documented scopes, a relying app receives no email from TikTok, so it cannot match an existing account by email through Login Kit. This is an inference from the scope table, not a documented statement.
- **Unconfirmed.** TikTok-side behavior when a TikTok login for a relying app carries an email already tied to another TikTok account.

### (3) User-initiated linking from a signed-in session

- **Unconfirmed.** No primary page describes linking a TikTok login to an existing account of a relying app. The Login Kit overview does not mention linking.
- **Excerpt (TikTok account email change).** Changing the account email requires a code sent to the new address, and "Both the old and new addresses must be active for this to work." This is a signed-in account action, but it is not a social-login link.
    - Source: https://support.tiktok.com/en/log-in-troubleshoot/log-in/email-and-phone-number (search excerpt)

### (4) Email verification before linking

- **Excerpt.** An email change is confirmed with a code sent to the new address, and both the old and new addresses must be active (see above). Verification for sign-up or for linking a social login is **unconfirmed**.

---

## Patterns the vendors document

1. **The identity provider enforces one account per email and does not merge.** GitHub: an email "can only be associated with one GitHub account at a time," and the owner must remove it. TikTok: one email per account (excerpt). Meta: no way to merge accounts, users consolidate manually. Conflicts are resolved by changing or removing the email on the other account, not by silent linking.
2. **The relying app owns the matching policy.** Meta's guidance is explicit: request the `email` permission, look up the app's own account by email, merge on a match, create a new user without one, and offer manual merge when emails differ. GitHub's OAuth docs are silent on matching. TikTok's Login Kit exposes no email, so matching is not possible through the documented API.
3. **Linking is documented as a user action from an account the user controls.** GitHub: add a social login email to an existing password account. Meta: add accounts to Accounts Center, and an explicit merge option in the app. The only documented automatic merge is the relying-app email match in Meta's guide (excerpt).
4. **Verification is recommended, rarely a documented precondition.** GitHub exposes a `verified` flag and recommends verification to protect OAuth apps; unverified email does not block most actions. Meta recommends verifying the Facebook email before a password is added. TikTok confirms an email change with a code sent to the new address, with both addresses required to be active (excerpt). None of the fetched pages states that verification is required before a social login is linked.
5. **Recovery releases the email.** GitHub's locked-account process can unlink an email, and the email can then be linked to a new or existing account (so a linked email is not permanently bound to the first account).

## Unconfirmed items (consolidated)

- GitHub: outcome of a Google or Apple sign-up whose email already belongs to another account; outcome of social sign-in with such an email; whether a social login email must be verified before linking; settings-page UI for unlinking social identities (excerpt only).
- Meta: exact signup message when the email is taken (excerpt only); whether the email-match merge re-authenticates the existing app account; whether the email-match merge requires verification (not stated in excerpt).
- TikTok: all social sign-up and social sign-in collision behavior; linking from a signed-in session; verification before linking; full FAQ text (excerpt only).
- General: no primary source found that documents automatic linking across two different login methods by the same identity vendor.

## Sources

| Vendor | URL                                                                                                                          | Grade                                              |
| ------ | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| GitHub | https://docs.github.com/en/account-and-profile/how-tos/account-management/creating-an-account-on-github                      | Confirmed                                          |
| GitHub | https://docs.github.com/en/account-and-profile/how-tos/email-preferences/troubleshooting-adding-an-email                     | Confirmed                                          |
| GitHub | https://docs.github.com/en/account-and-profile/concepts/email-addresses                                                      | Confirmed                                          |
| GitHub | https://docs.github.com/en/account-and-profile/how-tos/email-preferences/verifying-your-email-address                        | Confirmed                                          |
| GitHub | https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/about-authentication-to-github                | Confirmed                                          |
| GitHub | https://docs.github.com/en/account-and-profile/how-tos/account-management/unlinking-your-email-address-from-a-locked-account | Confirmed                                          |
| GitHub | https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps                                        | Confirmed                                          |
| GitHub | https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps                                         | Confirmed                                          |
| GitHub | https://docs.github.com/en/rest/users/emails                                                                                 | Confirmed (schema)                                 |
| GitHub | https://docs.github.com/en/rest/users/social-accounts                                                                        | Confirmed (profile links only, not used for login) |
| Meta   | https://developers.facebook.com/documentation/facebook-login/overview                                                        | Confirmed                                          |
| Meta   | https://developers.facebook.com/documentation/development/permissions                                                        | Confirmed                                          |
| Meta   | https://developers.facebook.com/docs/facebook-login/testing-your-login-flow?locale=en_GB                                     | Confirmed (test case)                              |
| Meta   | https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow                                              | Confirmed (no email guidance)                      |
| Meta   | https://developers.facebook.com/docs/facebook-login/multiple-providers?locale=en_GB                                          | Excerpt (404 on direct fetch)                      |
| Meta   | https://en-gb.facebook.com/help/185285184853471                                                                              | Confirmed                                          |
| Meta   | https://en-gb.facebook.com/help/1026219344754266                                                                             | Confirmed                                          |
| Meta   | https://www.facebook.com/help/203498356357867?locale=en_US                                                                   | Confirmed                                          |
| Meta   | https://en-gb.facebook.com/help/contact/255904741169641                                                                      | Excerpt (404 on direct fetch)                      |
| TikTok | https://developers.tiktok.com/docs/en/login-kit-overview                                                                     | Confirmed                                          |
| TikTok | https://developers.tiktok.com/doc/login-kit-web                                                                              | Confirmed                                          |
| TikTok | https://developers.tiktok.com/docs/en/tiktok-api-scopes                                                                      | Confirmed                                          |
| TikTok | https://developers.tiktok.com/docs/en/scopes-overview                                                                        | Confirmed (lists only user.info.basic)             |
| TikTok | https://support.tiktok.com/en/log-in-troubleshoot/log-in/email-and-phone-number                                              | Excerpt (search only)                              |
