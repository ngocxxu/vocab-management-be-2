# Post-Reset Confirmation and Return-to-App Wording

Scope: Google, Microsoft, Slack, Notion, GitHub, Stripe, Dropbox. Checked 2026-10-20. Method: 7 web searches and 8 page fetches (15 research calls, the guidance limit). No live UI, screenshots, or test reset flows were inspected, so exact on-screen strings could not be verified. The brief asked for short quotes for each product. The copyright rule limits this file to one quoted line, so everything else is paraphrased with URLs.

## Q1: What is the exact success text after a password reset?

### Takeaway

No official help page I fetched quotes an on-screen success message for any of the seven products, so exact wording is unverified across the board. The official pages describe the steps before the new password is saved and, in a few cases, what happens afterwards (sign-out notices, a sign-in step). Success wording that appears in search snippets comes from third-party guides or a community answer and is unverified.

### Cited Findings

- Dropbox's official reset article covers the emailed link and the new-password step. It says nothing after the password is saved. [Dropbox Help Center](https://help.dropbox.com/accounts-billing/settings-sign-in/password-reset)
- Slack's official reset article covers the add-password email and sign-in confirmation codes. It has no post-reset message. [Slack Help, article 201909068](https://slack.com/help/articles/201909068)
- Notion's "I can't log in" article covers the link to workspace Settings and a final log-in-again step. It has no success screen. [Notion Help](https://www.notion.com/help/cant-log-in)
- Stripe's fetched article ends at the entry point: the reset form, or the forgot-password link on the login screen. It has no post-reset text. [Stripe Help](https://support.stripe.com/questions/reset-a-forgotten-stripe-password)
- GitHub's credentials article has no on-screen success text. It covers an optional mobile-app sign-out after a reset. [GitHub Docs](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/updating-your-github-access-credentials)
- Google's password help page has no success text. It describes sign-out of other devices after a change. [Google Account Help](https://support.google.com/accounts/answer/41078)
- Microsoft: the official consumer page I guessed returned 404, so none was retrieved. A Microsoft Q&A community answer (search snippet, not fetched) describes a confirmation screen saying the password was changed, then sign-in with the new password. Community answer, unverified. [Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/1833617/how-can-reset-a-forgotten-microsoft-account-passo)
- Slack, third-party (search snippet, not fetched): a guide says a success notice appears after a new password is saved in Account Settings, followed by a confirmation email. Not on Slack's own page; unverified. [Online Tech Tips](https://www.online-tech-tips.com/?p=99125)
- Microsoft, non-vendor (search snippets, not fetched): two non-Microsoft IT help-desk pages describe a success confirmation at the end of an account reset. The wording-to-page mapping is not confirmed. [Pcs for People](https://support.pcsforpeople.org/support/solutions/articles/43000698730-microsoft-account-forgotten-password-reset), [Curry College](https://support.curry.edu/support/solutions/articles/19000147681)

#### Fetch status

- Fetched and read: Dropbox, Slack, Notion, Stripe (partial), GitHub, Google.
- Not retrieved: Microsoft official consumer page (404 on the guessed URL); Microsoft work/school article (listed in search, not fetched: https://support.microsoft.com/topic/23dde81f-08bb-4776-ba72-e6b72b9dda9e).
- Dates: only the Dropbox article shows a date in the results (last updated 28 Nov 2025). The other pages showed no visible date in what I fetched, so "current as of 2026" is unconfirmed for them.

### Inferences

- Official help centers describe the flow, not the post-reset screen. Exact success copy would need the live UI or screenshots.
- Where products do describe the after-reset state, it concerns sign-out and signing in again, not a success message.

### Gaps

- Exact on-screen success text for all seven products.
- Microsoft official consumer and work/school success text.
- Stripe's post-reset confirmation email: a search summary says one is sent, but the fetched page does not include it, so it is unverified.

## Q2: Do products say to close the window or return to the app, and do they redirect automatically?

### Takeaway

None of the fetched official sources say to close the window or return to the app, and none describe an automatic redirect after a reset. The closest verified language is sign-in-again guidance (Google, Notion). Whether each product offers a link or button back is unverified for all seven.

### Cited Findings

- Notion: the web flow's last step tells the user to log in again. [Notion Help](https://www.notion.com/help/cant-log-in)
- Google: after a change or reset, the user is signed out everywhere except devices used for verification, and may need to sign in again on other devices. [Google Account Help](https://support.google.com/accounts/answer/41078)
- GitHub: after a reset, signing out the GitHub Mobile app is a separate, optional step (revoke the mobile OAuth app authorization). The page does not say whether browser sessions end. [GitHub Docs](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/updating-your-github-access-credentials)
- Dropbox: the official article says the mobile app cannot reset the password, and sends users to the website in a browser. [Dropbox Help Center](https://help.dropbox.com/accounts-billing/settings-sign-in/password-reset)
- Slack: no return-to-app or sign-in text on the reset or add-password article. [Slack Help](https://slack.com/help/articles/201909068)

#### Per-product grid

"Not documented" means not found in the fetched text. It does not prove the live UI lacks the element.

| Product   | Success text verified            | Return or sign-in wording (verified source)                        | Link or button back | Automatic redirect |
| --------- | -------------------------------- | ------------------------------------------------------------------ | ------------------- | ------------------ |
| Google    | No                               | Signed out of other devices; may need to sign in again (help text) | Not documented      | Not documented     |
| Microsoft | No (official page not retrieved) | Community answer says sign in with the new password (unverified)   | Not documented      | Not documented     |
| Slack     | No                               | None found in the reset article                                    | Not documented      | Not documented     |
| Notion    | No                               | Final step is logging in again (help text)                         | Not documented      | Not documented     |
| GitHub    | No                               | Optional mobile-app sign-out only                                  | Not documented      | Not documented     |
| Stripe    | No                               | None on the fetched page                                           | Not documented      | Not documented     |
| Dropbox   | No                               | Reset must be done on the website, not the mobile app              | Not documented      | Not documented     |

### Inferences

- The consistent verified pattern is a sign-in-again step in help text, not a return-to-app control. The live UI may differ; this is an inference.
- Whether any product sends the user back to the app automatically cannot be settled from help text.

### Gaps

- Live post-reset screens for all seven products.
- Stripe's confirmation email (search summary only; see Q1 gaps).

## Q3: Is the next step placed in the title, the body, or a button?

### Takeaway

This cannot be verified from the sources reached. Help articles do not describe the layout of post-reset screens, so the placement of any next step (title, body, or button) is unconfirmed for all seven products.

### Cited Findings

- Notion's help sequence puts the sign-in step after the password is set. This is the only verified ordering of next-step language. [Notion Help](https://www.notion.com/help/cant-log-in)
- Google's help places the sign-in note in running prose about what happens after a change, not as a labeled step. [Google Account Help](https://support.google.com/accounts/answer/41078)

### Inferences

- If products follow their help text, the next step sits in body copy rather than a button. This is an inference from help-article wording, not from the UI.

### Gaps

- No UI screenshots or live strings were retrieved for any product.
- GOV.UK Design System confirmation-page guidance (the "what happens next" pattern the brief names): the guessed URL returned 404 and no replacement was retrieved. Not verified.
- Nielsen Norman Group: not searched. No claims made.

## Q4: What is the most common phrasing, and how do mobile and web resets differ?

### Takeaway

In the verified sources, sign in again or log in again is the most common next-step phrasing, though it appears in help text rather than confirmed UI. Mobile handling differs by product: Dropbox sends password resets to the browser; GitHub treats mobile sign-out as a separate step; Slack's add-password steps are written for desktop; Notion's reset starts at the web login page. The sample is six help centers, so this is not a frequency study.

### Cited Findings

- Dropbox: the official article states that the mobile app cannot reset or change the password, and tells users to log in at dropbox.com in a browser. The one quotation in this file: "You can’t reset or change your Dropbox password in the mobile app." [Dropbox Help Center](https://help.dropbox.com/accounts-billing/settings-sign-in/password-reset)
- Notion: the reset starts at the web login page in a browser. The article has no mobile-specific reset text. [Notion Help](https://www.notion.com/help/cant-log-in)
- GitHub: signing out the GitHub Mobile app after a reset is a separate action (revoking OAuth app authorization). [GitHub Docs](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/updating-your-github-access-credentials)
- Slack: the add-password steps are written for desktop, starting from the profile picture. The article notes no mobile differences. [Slack Help](https://slack.com/help/articles/201909068)
- Google: the sign-in-again note applies to other devices. [Google Account Help](https://support.google.com/accounts/answer/41078)
- Microsoft: no verified mobile text.

### Inferences

- The most common verified phrasing is sign in again or log in again. Two fetched sources use it (Google, Notion). A search snippet on Slack's admin reset-all article uses similar wording (not fetched; see below).
- Mobile-origin resets are not handled consistently in verified text. Where help text mentions mobile, it either blocks the reset in the app (Dropbox) or treats the app as a separate session to sign out (GitHub). No verified source describes returning to the app after a mobile reset.

### Gaps

- Mobile-origin reset behavior (app deep link, in-app return, browser handoff) for all seven products: not verified.
- Frequency of phrasing across a larger sample: not possible from seven help centers.
- Slack admin reset-all email wording: search snippet only, from https://slack.com/help/articles/204510068-Reset-all-Slack-passwords. Not fetched.
