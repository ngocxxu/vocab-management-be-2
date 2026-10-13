# Hardening release rollout runbook

Human steps for FE issue #25. Blockers BE #9 (role hardening) and BE #11 (basic auth on queue dashboard and Swagger) are closed.

Run the steps in order. Each has a check. Do not paste secret values into chat, shell history, or this file. Placeholders in `<angle brackets>` are filled in during the run.

Scope: production only. `infrastructure/` has one cluster (`mmo-vps`) and no staging deployment. Host: `vocab-be.ngocquach.com`.

## Before you start

- Doppler CLI logged in, with access to project `vocab-be`. Confirm the prod config name with `doppler configs -p vocab-be`. This runbook assumes `prd`.
- `psql` on a host that can reach the prod database.
- `kubectl` context for `mmo-vps`, namespace `project-vocab`.

## Facts this runbook relies on

- Env vars come from Doppler. The Doppler operator copies every variable, names unchanged, into the Kubernetes secret `vocab-be-env` (namespace `project-vocab`). Source: `infrastructure/clusters/mmo-vps/apps/project-vocab/vocab-be-secret.yaml`.
- Deployment `vocab-be` loads that secret with `envFrom`. A changed value takes effect only after a pod restart.
- BE validates `SWAGGER_ENABLE`, `SWAGGER_PREFIX`, `SWAGGER_USER` and `SWAGGER_PASSWORD` as required at boot, even when Swagger is off. A missing one stops the pod from starting. Step 7 checks the names before the restart in step 8.
- Roles are read from the database on each request. A role change needs no re-login.

## 1. Snapshot the ADMIN accounts (read only)

Prod Postgres runs inside the cluster: Bitnami release `postgresql`, namespace `shared`, ClusterIP. Open a tunnel in its own terminal and leave it running:

```bash
kubectl -n shared port-forward svc/postgresql 5432:5432
```

In a second terminal, connect. The URL comes from Doppler and is rewritten to the tunnel. Only the host and port change; user, password and database are kept. It is never printed:

```bash
DB_URL=$(doppler secrets get DATABASE_URL --plain -p vocab-be -c prd | sed -E 's#@[^/]+/#@localhost:5432/#; s/\?schema=public$//')
psql "$DB_URL"
```

If the Doppler `DATABASE_URL` points at a managed database rather than the cluster, skip the tunnel and connect directly.

List current admins:

```sql
SELECT email, first_name, last_name, is_active, created_at
FROM "user"
WHERE role = 'ADMIN'
ORDER BY created_at;
```

Keep this output. It is the rollback record.

## 2. Demote unexpected ADMIN accounts

For each unexpected email from step 1, run in a transaction:

```sql
BEGIN;
UPDATE "user" SET role = 'GUEST', updated_at = now()
WHERE email = '<UNEXPECTED_EMAIL>' AND role = 'ADMIN';
```

Expect `UPDATE 1`, then `COMMIT;`. Any other result: `ROLLBACK;` and check the email.

## 3. Promote the legitimate ADMIN

```sql
BEGIN;
UPDATE "user" SET role = 'ADMIN', updated_at = now()
WHERE email = '<ADMIN_EMAIL>';
```

Expect `UPDATE 1`, then `COMMIT;`. `UPDATE 0` means no account has that email. `ROLLBACK;` and stop the rollout. Step 4 requires an admin.

## 4. Gate: at least one active ADMIN

```sql
SELECT count(*) AS active_admins FROM "user" WHERE role = 'ADMIN' AND is_active = true;
```

The count must be 1 or more. Zero means stop. Do not deploy.

## 5. GUEST subject quota: 3 → 5

```sql
SELECT role, is_active, limits->>'subjects' AS subjects FROM plan WHERE role = 'GUEST';
```

- No row, or `is_active` is false: no change. The code default applies (5).
- `subjects` is `5`: no change.
- `subjects` is `3`: update it.

```sql
BEGIN;
UPDATE plan SET limits = jsonb_set(limits, '{subjects}', '5'), updated_at = now() WHERE role = 'GUEST';
```

Expect `UPDATE 1`, then `COMMIT;`.

## 6. API-key clients check

```sql
SELECT id, name, key_prefix, user_id, scopes, created_at, last_used_at FROM api_key ORDER BY created_at;
```

Do not select `key_hash`.

- Zero rows: nothing to do.
- Any rows: stop before deploy. Decide with each key's owner whether the key keeps write access (it will lose it on the routes in step 11), gets notified, or is revoked.

## 7. Doppler env (project `vocab-be`, config `prd`)

Set each name exactly as shown. Names are uppercase and copied as-is.

| Name                  | Value     | Why                                                                                    |
| --------------------- | --------- | -------------------------------------------------------------------------------------- |
| `SWAGGER_ENABLE`      | `0`       | Swagger off in prod. Only `1` serves it.                                               |
| `SWAGGER_PREFIX`      | `/docs`   | Required even when Swagger is off. Non-root, so basic auth applies if it is turned on. |
| `SWAGGER_USER`        | new value | Required even when Swagger is off. Doppler only.                                       |
| `SWAGGER_PASSWORD`    | new value | Same as above.                                                                         |
| `BULL_BOARD_USER`     | new value | Queue dashboard at `/admin/queues`. Unset means 404.                                   |
| `BULL_BOARD_PASSWORD` | new value | Same as above.                                                                         |

Set them in the Doppler dashboard, or interactively. The interactive form prompts, so the value stays off the command line:

```bash
doppler secrets set -p vocab-be -c prd SWAGGER_ENABLE
```

Check that all six names exist. This prints names only:

```bash
doppler secrets --only-names -p vocab-be -c prd | grep -E '^(SWAGGER_|BULL_BOARD_)'
```

Expect six lines.

## 8. Sync check, then restart

Quiet window. The deployment runs one replica, so the restart causes a brief outage.

Check the Kubernetes secret has the names. Keys only, no values:

```bash
kubectl -n project-vocab get secret vocab-be-env -o json | jq -r '.data | keys[]' | grep -E '^(SWAGGER_|BULL_BOARD_)'
```

Expect six lines. If any are missing, wait for the operator to sync. Do not restart until all six are present.

Restart and wait:

```bash
kubectl -n project-vocab rollout restart deployment/vocab-be
kubectl -n project-vocab rollout status deployment/vocab-be
```

Expect `successfully rolled out`. If the pod crash-loops, a required variable is missing. Fix it in Doppler and restart again, or roll back (step 10).

## 9. Verify

Queue dashboard, no credentials. Expect `401`:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://vocab-be.ngocquach.com/admin/queues
```

Queue dashboard, with credentials. Expect `200`. Doppler injects the values, so they never appear in the command:

```bash
doppler run -p vocab-be -c prd -- sh -c 'curl -s -o /dev/null -w "%{http_code}\n" -u "$BULL_BOARD_USER:$BULL_BOARD_PASSWORD" https://vocab-be.ngocquach.com/admin/queues'
```

If that returns `404` with credentials set, the route sits under the API prefix. Retry with `<API_PREFIX>/admin/queues`. The route path was not run against a live server, so this check is the test.

Swagger, off. Expect `404`:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://vocab-be.ngocquach.com/docs
```

Optional: a demoted account's token on an admin route, for example `GET <API_PREFIX>/users`. Expect `403`. Read `<API_PREFIX>` from Doppler.

## 10. Rollback

- Swagger or Bull Board: revert the Doppler values, then restart as in step 8.
- Roles: restore the previous role from the step 1 snapshot, in a transaction, expecting `UPDATE 1`:

    ```sql
    UPDATE "user" SET role = '<previous role>', updated_at = now() WHERE email = '<email>';
    ```

- GUEST subjects, only if step 5 changed it:

    ```sql
    UPDATE plan SET limits = jsonb_set(limits, '{subjects}', '3'), updated_at = now() WHERE role = 'GUEST';
    ```

## 11. Endpoints that are now ADMIN-only

Checked against the controllers on `feat/admin-page-2`.

- **Users:** `GET /users`, `GET /users/:id`, `POST /users`, `PUT /users`, `DELETE /users/:id`. `DELETE /users/me` is unchanged.
- **Languages:** `POST /languages`, `PUT /languages/:id`, `DELETE /languages/:id`. `GET` is unchanged.
- **Word types:** `POST /word-types`, `PUT /word-types/:id`, `DELETE /word-types/:id`. `GET` is unchanged.
- **Notifications:** `GET /notifications`, `POST /notifications`, `PUT /notifications/:id`, `DELETE /notifications/:id`, `DELETE /notifications/cleanup/expired`, `GET /notifications/broadcasts`, `POST /notifications/broadcast`.
- **Unchanged member routes:** `GET /notifications/my`, `GET /notifications/my/unread`, `GET /notifications/my/unread-count`, `PATCH /notifications/:id/my/mark-as-read`, `PATCH /notifications/my/mark-all-as-read`, `GET /notifications/:id`, `PATCH /notifications/:id/status`, `DELETE /notifications/:id/my`.

Clients checked:

- **FE web app:** admin-only writes come only from `/admin` pages. Member pages use the unchanged `/my` routes.
- **vocab-extension:** only `GET /languages` and `GET /word-types`. Unaffected.
- **vocab-mobile:** no calls found.
- **API-key clients:** see step 6.

## 12. Release notes text

Paste into the release notes:

- GUEST subject limit: 3 → 5. Applies where the prod plan row was 3. The code default and the seed are already 5.
- Admin-only now: user management, language and word-type writes, and notification management. Reads of languages and word types are unchanged. Member notification routes are unchanged.
- Queue dashboard requires basic auth and returns 404 when its credentials are unset. Swagger is off in production.
