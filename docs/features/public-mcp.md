# Public MCP endpoint

Lets external AI clients (Claude, ChatGPT) call a small set of Vocab tools, signed in as the user. Code: `src/domains/mcp/`.

## Switch and config

- `MCP_ENABLED=true` turns it on. Off by default. When off, both routes return 404.
- `MCP_RESOURCE_URL`: public URL of `POST <API_PREFIX>mcp`. It is also the Auth0 API identifier.
- `AUTH0_ISSUER` must be set when MCP is on.
- `MCP_ALLOWED_ORIGINS`: browser origins only. Native and CLI clients send no `Origin`, so they are always allowed.

## Routes

- `GET /.well-known/oauth-protected-resource` (origin root, no auth): names the Auth0 issuer, the resource URL and the scopes `vocab:read`, `vocab:write`.
- `POST <API_PREFIX>mcp`: stateless Streamable HTTP with JSON responses. GET and DELETE return 405.

## Auth

- An Auth0 access token with audience `MCP_RESOURCE_URL` is required. Missing or bad tokens get 401 with `WWW-Authenticate: Bearer resource_metadata="..."`.
- The token's issuer and subject resolve to a User through the Identity table. Unknown identities get 401.
- Web-app tokens are rejected on MCP. MCP tokens are rejected on the REST routes.
- MCP needs a plan that includes it and the per-user flag. A GUEST (the Free plan) gets 403 `mcp_requires_plan`. A user whose `mcpAccess` an admin switched off gets 403 `mcp_access_disabled`. The flag is on by default. Role and flag are read from the database on every request, so a downgrade or a switch-off stops the next call, even for a token already issued.
- Rate limit: 120 per minute per IP, before sign-in. Per-user limits are a separate ticket (#24).
- Flow diagrams (connect, per-request guards) are in [feature-workflows](../agents/feature-workflows.md#public-mcp-external-ai-clients).

## Set up in Auth0 (once per environment)

1. Create an API. Identifier = `MCP_RESOURCE_URL`, exactly. Signing algorithm `RS256` (the backend accepts only RS256; Auth0 defaults to HS256). Add scopes `vocab:read` and `vocab:write`.
2. Set **Maximum Access Token Lifetime** and **Implicit / Hybrid Flow Access Token Lifetime** to `900`. Set the implicit value first: Auth0 rejects implicit > maximum (`token_lifetime_for_web cannot be larger than token_lifetime`).
3. Import each client's CIMD URL (Claude, Claude Code, ChatGPT) as a third-party app, and authorise the client for the API.
4. Promote each connection the clients use to domain level (connection > Advanced Settings). Without it, a third-party client fails with `no connections enabled for the client`.

## Local test

Cloud clients (ChatGPT, Claude) cannot reach `localhost`, so use a public HTTPS tunnel:

1. Set `MCP_ENABLED=true` and `MCP_RESOURCE_URL=https://<tunnel-host>/api/v1/mcp`. A plain `http://localhost` URL works only with curl and tests, not with cloud clients.
2. Create the Auth0 API with that exact identifier. A free tunnel changes its URL on each start, so each new URL needs a new API (identifiers cannot be changed).
3. Check with curl: metadata returns 200; `POST` without a token returns 401 with `WWW-Authenticate`.
4. Connect the client, then call `list_vocab`.

## Token lifetime and revoke

- Access token: 900 seconds. The backend checks the JWT locally, so a revoked token works until it expires.
- Revoking the grant in Auth0 invalidates the refresh token. The client must connect again, with a new consent.

## Tools

- `list_vocab` (`vocab:read`): the caller's vocab, newest first. Output has text, languages, mastery score, created date and meanings. No internal ids.
- Each tool declares a required scope. A token without it gets an `insufficient_scope` tool error.
- Inputs use strict schemas: unknown keys are rejected.

## Errors

Tool errors are MCP results with a stable `error.code`: `invalid_params`, `unknown_tool`, `insufficient_scope`, `response_too_large`, `internal_error`. Causes stay in the log and Sentry.

## Not yet

- Per-user rate limits (#24), request logging (#25), write tools (#26).
