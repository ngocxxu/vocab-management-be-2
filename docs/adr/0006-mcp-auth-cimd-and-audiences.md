# The public MCP uses Auth0 with CIMD clients only and a separate MCP audience

The public MCP endpoint (#17) lets external AI clients (Claude, Claude Code, ChatGPT) call approved Vocab tools for one signed-in user. This ADR records how those clients sign in and how their tokens are kept apart from web-app tokens. It is the result of #18.

## Decision

- **Authorization server**: Auth0, one tenant per environment. Clients register with **Client ID Metadata Documents (CIMD)** and use Authorization Code + PKCE (S256). Dynamic client registration is off, and there is no fallback to it.
- **Client allow-list**: a tenant admin imports each client's CIMD URL in Auth0. Only imported clients get tokens. Dynamic CIMD Registration stays off. It is Early Access under the Free Trial terms, so it is not used for production.
- **Tenant settings**: CIMD Registration on. Resource Parameter Compatibility Profile on, so the RFC 8707 `resource` parameter selects the MCP API.
- **Separate audience**: the MCP endpoint is its own Auth0 API. Its identifier equals `MCP_RESOURCE_URL`. The MCP guard accepts only that audience. The web guards accept only the web audience. A token for one is rejected by the other.
- **Scopes**: `vocab:read` and `vocab:write`, checked per tool. A missing scope returns `insufficient_scope`.
- **Identity**: the token's issuer and subject resolve to the internal User through the Identity table (ADR 0003). Unknown identities are rejected.
- **Connections for third-party clients**: each connection that these clients use is promoted to domain level in Auth0. A promoted connection is available to every third-party app in the tenant.

## Why

- CIMD lets the client identify itself with a URL we can review. DCR would let anyone register and get tokens, so it stays off.
- A separate audience means a token stolen from the web app cannot call MCP, and an MCP token cannot call REST routes.
- Scopes limit what each client can do, and Auth0 shows the consent screen for them.

## Verified (dev tenant, #18)

- Discovery advertises CIMD and S256, and has no registration endpoint.
- The three clients import as CIMD clients.
- ChatGPT completes sign-in and consent. Its `list_vocab` call returns the signed-in user's vocabulary.
- The `resource` parameter sent by ChatGPT matches the MCP audience.
- ChatGPT also requests `offline_access`, so it gets a refresh token.

## Token lifetime and revocation

- MCP access token lifetime: **900 seconds (15 minutes)**, for both the maximum and the implicit/hybrid flow setting in the Auth0 API. The web default of 86400 seconds was too long: after a revoke, an issued token stays valid until it expires, because the backend validates JWTs locally.
- Revocation: a user's grants are listed and revoked through the Management API (#36). Revoking the grant in the dashboard made the next request from ChatGPT still succeed, because the access token issued before the revoke was still valid. Auth0 invalidates refresh tokens of a revoked grant. Confirmed on the dev tenant: after the grant was revoked and 15 minutes had passed, ChatGPT no longer had a working connection and asked the user to connect again.
- Claims of an MCP token (`iss`, `aud`, `azp`, `scope`, `sub`): not collected as a separate step. The `resource` parameter and the successful `list_vocab` call show that the token was issued for the MCP audience and resolved to the right User.

## Consequences

- Adding a client means an admin imports its CIMD URL, and the client is then authorized for the MCP API.
- Every connection a third-party client uses must be domain-level. This affects all third-party apps in the tenant, so review it before production.
- Dynamic CIMD is not used. If Auth0 makes it generally available and the cost is acceptable, this decision can be reopened.
- A ChatGPT CIMD rejection, which #17 flagged as a risk, was not reproduced in the dev tenant.
