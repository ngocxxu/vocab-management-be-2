# Linking existing password users to Auth0

Google users are mapped automatically by `pnpm auth0:seed-identities` (issue #30). The few users who signed in to Supabase with **email and password** have no Google id to map from, so an admin links each of them by hand. Nothing here is automatic and nothing is matched by email: you choose every pair, and the script only checks that both sides are verified and are the same address.

## Before you start

- Run this once per environment, against that environment's Auth0 tenant and database. `AUTH0_ISSUER` and `DATABASE_URL` must be for the **same** environment; the script prints both so you can check.
- The Auth0 account must use **exactly the same email** as the Vocab user. This is what makes the first login stop with `account_link_required` instead of creating a new account (see "If something goes wrong").
- Nothing else needs undoing if you stop: the only write is a row in `user_identity`.

## 1. Find the password users

Supabase SQL editor of the environment:

```sql
select u.id as supabase_user_id, u.email
from auth.users u
join auth.identities i on i.user_id = u.id
where i.provider = 'email';
```

Drop anyone who also has a Google identity (the seed script handles them). Then, in the **Vocab database**, look up their local ids:

```sql
select id as user_id, email, supabase_user_id
from "user"
where supabase_user_id in ('<supabase_user_id>', '...');
```

`user_id` is the `userId` column of the list below.

## 2. Send the Auth0 "set new password" email

For each user, create their login in the Auth0 **database connection** with the same email, and send the password-change email (Auth0 dashboard: User Management, Users, the user, Actions, Change password; or the Management API). They can only sign in to Vocab once the app is on Auth0.

## 3. They sign in once

On first login the app calls `POST /auth/sync`. Because their email already belongs to a User and no Identity exists yet, it returns **409 `account_link_required`** and writes nothing. That means they are ready to be linked.

## 4. Build the reviewed list

For each user, read the Auth0 `user_id`, email and `email_verified` **from Auth0 itself** (dashboard user page or export); do not type `true` from memory, since the script cannot check Auth0 for you. Save as plain UTF-8 CSV (no quotes) with exactly this header:

```csv
userId,auth0Sub,auth0Email,auth0EmailVerified
cmabc123,auth0|65f0aa11bb22cc33dd44ee55,pat@example.com,true
```

Review every row yourself: the person behind the Auth0 login must be the person who owns that Vocab account.

## 5. Dry run, then write

```bash
pnpm auth0:link-identities list.csv           # dry run, writes nothing
pnpm auth0:link-identities list.csv --write   # write
```

A row is refused, and nothing is written for it, when: the User does not exist or is inactive; the User's email is not confirmed; the Auth0 email is not verified or is not the same address; the Auth0 login is already linked to someone else; the User already has a different Identity for this tenant; or the user or Auth0 login appears twice in the file. Fix or remove refused rows and run again. Re-running is safe: pairs that are already linked are skipped. Exit code `2` means some rows were refused.

## 6. Verify

Ask the user to sign in again. `/auth/sync` now returns their original account (200, same `id`), and their own vocabulary list is there. Confirm no second User exists for their email.

## If something goes wrong

- **The Auth0 email differs from the Vocab email.** The row is refused (`email_mismatch`), and worse, that user's first login will not collide with anything, so the app creates a **new, empty** User for the Auth0 login. That new User then owns the Auth0 subject, and linking is refused (`subject_mapped_to_other_user`). Fix: make the Auth0 email match, check the new User is empty (no vocabulary), delete it, then link.
- **Undo a link.** Delete that one row from `user_identity` (by `user_id` and `issuer`). The user's data is untouched.
