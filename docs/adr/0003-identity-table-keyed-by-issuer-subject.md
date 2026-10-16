# External logins map to Users through an Identity table keyed by issuer + subject, never by email

Auth moves from Supabase to Auth0. Each external login is stored as an **Identity** row (`issuer`, `subject`, `userId`, unique on `(issuer, subject)`) pointing at the existing internal **User**. A request is authorised only after its token's issuer + subject resolves to a User; an unmapped identity is rejected (`identity_not_provisioned`) rather than matched or created implicitly. The internal `users.id` stays the only id the rest of the system sees, and the provider's `sub` is never used as one.

We chose this over matching by email, or over adding an `auth0UserId` column next to `supabaseUserId`, for three reasons. Email is not a safe join key: an unverified or re-assigned address would attach a stranger to someone's vocabulary. A single column per provider does not model one User with several logins (Google and password), which already happens. And keying on issuer as well as subject keeps separate tenants (dev, prod) and a future provider from colliding. The cost is that every existing user must be seeded with an explicit Identity before cutover, and an email collision on first login needs an admin to link the account by hand instead of auto-merging.

Roles are unaffected: the database `User.role` stays the single source of truth, and token claims never grant roles.
