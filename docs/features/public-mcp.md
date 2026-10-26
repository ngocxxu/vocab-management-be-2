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
- Rate limit: 120 per minute per IP, before sign-in. Per-user limits are a separate ticket (#24).

## Tools

- `list_vocab` (`vocab:read`): the caller's vocab, newest first. Output has text, languages, mastery score, created date and meanings. No internal ids.
- Each tool declares a required scope. A token without it gets an `insufficient_scope` tool error.
- Inputs use strict schemas: unknown keys are rejected.

## Errors

Tool errors are MCP results with a stable `error.code`: `invalid_params`, `unknown_tool`, `insufficient_scope`, `response_too_large`, `internal_error`. Causes stay in the log and Sentry.

## Not yet

- Per-user MCP access flag (#21), per-user rate limits (#24), request logging (#25), write tools (#26).
