# Post-reset return-to-app wording

Research status: partial. Product reset-email bodies were mostly not retrieved. UX guidance is verified only for NN/g. Anything marked UNVERIFIED comes from a search snippet, a redirect, or a page that returned only its title.

## Q1. How reset emails word the call to action and any post-link sign-in step

### Takeaway

No product reset-email body was verified for Google, Microsoft, Slack, Notion, GitHub, Stripe, Dropbox, or Auth0's default. The help-center pages that were checked describe the post-reset state, but none quotes a sentence telling the user to sign in with the new password. Whether such a sentence appears in the email itself, and where, is unknown.

### Cited Findings

- Auth0 documents two password-change emails, a "change password link" email and a "change password code" email, but the docs page does not include their default body text or variables. [Auth0 email templates docs](https://auth0.com/docs/customize/email/email-templates) (fetched)
- Auth0 community users report that the dashboard does not let you edit the default Password Reset template, and that the editor markup does not match the email actually sent. [Auth0 community thread](https://community.auth0.com/t/default-password-reset-email-template-customization/76613) (search snippet only; UNVERIFIED)
- Slack's reset article has no sentence telling the user to sign in with the new password after reset. The nearest lines are "Check your email for a link to add a password." (Add a password section) and "Enter the code on the sign-in page." (reset steps, step 4, which refers to a sign-in code, not a new password). [Slack help: Reset your password](https://slack.com/help/articles/201909068-Reset-your-password) (fetched through a summarising model, so quotes are checked against that summary only)
- Google's account-recovery help says that after a reset you will be signed out everywhere except devices you use to verify it is you. This is an outcome statement inside help text, not in the reset email. [Google Account help](https://support.google.com/accounts/answer/9366998?hl=en) (search snippet; the exact page carrying this sentence was not confirmed)
- No retrieved source quotes reset-email wording for GitHub, Microsoft, Notion, Dropbox, or Stripe. (Gap, no source.)

### Inferences

- In the pages checked, the "sign in after reset" instruction sits in help or confirmation copy, not in the reset email. Reset emails appear to focus on the link and its expiry. This is an inference from two products (Slack, Google) and is not verified across the set.

### Gaps

- Actual reset-email bodies for Google, Microsoft, Slack, Notion, GitHub, Stripe, Dropbox, and Auth0 defaults were not retrieved. To close this, open a real reset email or the product's own template page and record the wording and its position.
- Where the sign-in sentence sits in each email (above or below the button, or absent) is unknown.

## Q2. What UX guidance says about next-step wording

### Takeaway

The one verified source (NN/g error-message guidance) says naming the problem is not enough and users need a way forward. Apple, GOV.UK, and Google Material primary pages were not retrieved in usable form, so their next-step rules are UNVERIFIED.

### Cited Findings

- NN/g: "Naming the problem isn't enough. Users need a way forward." Article by Tim Neusesser and Evan Sunwall, dated May 14, 2023. [NN/g Error-Message Guidelines](https://www.nngroup.com/articles/error-message-guidelines/) (fetched)
- NN/g: use everyday words and avoid jargon, keeping codes for diagnostics. Same article. (fetched)
- NN/g: describe the specific problem; "An error occurred" gives users no context. Same article. (fetched)
- NN/g: the article covers error messages and does not address confirmation or success messages directly. Applying it to a success email is an inference. Same article. (fetched)
- Apple HIG alerts, per a search snippet from a mirror domain: titles should be specific, body text should be short complete sentences, and buttons should use specific action verbs rather than "OK". [Apple HIG Alerts](https://developer.apple.com/design/human-interface-guidelines/alerts) (fetch returned only the page title; snippet came from https://developer-rno.apple.com/design/human-interface-guidelines/components/presentation/alerts; UNVERIFIED)
- GOV.UK: the "writing for GOV.UK" URL redirects to guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/tone-of-voice/, which redirects again. The body was not retrieved, so no GOV.UK wording is quoted here. (UNVERIFIED)
- GOV.UK design system confirmation-page pattern (https://design-system.service.gov.uk/patterns/confirmation-page/) returned 404. (UNVERIFIED)
- Google Material: the communication codelab (https://codelabs.developers.google.com/codelabs/material-communication-guidance) is an introduction to UX writing. Per the search snippet it was last updated May 13, 2021, and its examples use American English. Its next-step content was not read. (UNVERIFIED)
- Third-party microcopy blogs say confirmation text should acknowledge the action and give next steps or a status. Example: [microcopy guide](https://ecommercefastlane.com/writing-microcopy-a-2026-guide-for-ecommerce-ux-with-examples-shopify/). Secondary sources, low weight.
- A third-party skill page cites Stripe's "Payment successful" as a two-word confirmation. Likely source: https://openskillindex.com/skills/intense-visions-harness-engineering-ux-microcopy-principles (not confirmed; UNVERIFIED).

### Inferences

- The transferable rule supported by verified text is: state what happened, then give one concrete next action and where to do it. This matches NN/g's "way forward" point and the secondary microcopy guidance.

### Gaps

- Official GOV.UK writing-guidelines body text (the redirect target was https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/; not fetched).
- Apple HIG alerts body text (only the title was returned).
- Official Material Design writing pages (only the codelab was surfaced, and not read).

## Q3. Candidate sentences for the email body, English and Vietnamese, graded

Translations are the researcher's own and have not been checked by a native reviewer. Grades are judgment calls based on the NN/g rule above and plain-language principles, not on a verified style guide.

| #   | English                                                                         | Vietnamese                                                                           | Grade | Why                                                                                                                                         |
| --- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Your password is updated. Return to the app and sign in with your new password. | Mật khẩu của bạn đã được cập nhật. Quay lại ứng dụng và đăng nhập bằng mật khẩu mới. | A     | Confirms the outcome, gives one action and its destination, and names which password to use, which guards against reusing the old one.      |
| 2   | Password updated. Open the app and sign in with your new password.              | Đã cập nhật mật khẩu. Mở ứng dụng và đăng nhập bằng mật khẩu mới.                    | A-    | Same content, shorter. Better as a subject line or preview text. "Open" fits a phone; use the sign-in page wording if the flow is web-only. |
| 3   | After you set your password, go back to the app and sign in.                    | Sau khi đặt mật khẩu, hãy quay lại ứng dụng và đăng nhập.                            | B     | Sequencing is clear, but it omits "updated" and "new password", and "go back" is ambiguous when the user arrives from an email link.        |

Recommendation: pick candidate 1 for the email body. It states the outcome, names one action, and states the destination and the correct password in a single sentence. Use candidate 2 as the subject or preview line. This assumes the app is reachable from the post-reset page; if the user is on a web-only flow, replace "the app" with the sign-in page.

### Cited Findings

- Candidate wording and grades are the researcher's judgment. Basis: NN/g "Naming the problem isn't enough. Users need a way forward." (https://www.nngroup.com/articles/error-message-guidelines/, fetched).

### Inferences

- Candidate 1 is the best fit for the "what happens next" step, since it closes the loop on the reset and tells the user where to go.

### Gaps

- No product-tested or A/B-tested evidence was found for any of these three sentences. Test before relying on the grade.
- Vietnamese wording has not been checked by a native reviewer or against a Vietnamese-language style guide.
