# A User links a new login themselves from an authenticated session; the admin link stays as a fallback

ADR 0003 left one case to an admin: a new login whose email already belongs to a User is refused with `account_link_required`, and an admin attaches the Identity by hand. We keep that rule, and add a second way to resolve the case: the User signs in with their existing login, then connects the new login from that authenticated session, proving they control both. An admin link stays available as a fallback.

The Account link still never happens automatically and never by email. What decides the link is the authenticated session plus a fresh sign-in with the new login, not a matching address. The new login must carry a verified email, and that email need not equal the User's email, because possession of both logins is already proven.

We chose this over keeping the admin-only link, and over linking silently by verified email. Admin-only does not scale and leaves a returning User locked out until someone acts. Silent linking by email is what Auth0 advises against: an attacker can create a password login with a victim's address and be merged into the victim's account, and `email_verified` only reduces that risk. GitHub and Meta resolve the same collision by sending the User back to the existing login and linking from there (see `docs/research/`).

We also refuse a password Provider sign-up whose email already belongs to a User, so the collision is caught at sign-up instead of at the first login. The message tells the User the email exists. We accept that this reveals that an address is registered.

This must land before the Supabase contract step (#35): the admin link script matches on `users.supabase_user_id`, the User-initiated link does not, so dropping that column no longer strands unlinked Users.
