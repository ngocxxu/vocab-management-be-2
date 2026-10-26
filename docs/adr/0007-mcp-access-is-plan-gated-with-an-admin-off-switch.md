# MCP access follows the plan, with a per-user admin off-switch

Public MCP (#17) first shipped behind a per-user `mcpAccess` flag that was off by default, so an admin had to turn it on for each User (#21). With a connect guide coming and MCP listed as a plan benefit, that no longer fits. This ADR records who gets MCP and what the flag now means.

## Decision

- **The plan is the entitlement.** A User on the `GUEST` role (the Free plan) has no MCP access. The MCP guard rejects them with 403 `mcp_requires_plan`. `MEMBER` and `ADMIN` can use MCP.
- **The flag is only an off-switch.** `mcpAccess` is on by default. An admin turns it off to cut one User. A User an admin switched off gets 403 `mcp_access_disabled`. The flag can never grant access to a `GUEST`.
- **The rule lives in the guard, not in plan data.** There is one plan per role, and role is already the key, so the guard checks the role directly. A field in `plan.limits` is not used.
- **Existing Users are switched on.** The migration sets `mcp_access` to true for every existing row, so current Members get the benefit the plan lists.
- **The benefit is listed as text.** One MEMBER plan feature line names MCP. It is display only and enforces nothing.

## Why

- A User must approve each outside app on the Auth0 consent screen before it gets a token. The flag was therefore never the User's consent, only an admin gate, and opt-in made every Member wait for an admin.
- Free users stay without MCP, so MCP is a reason to upgrade, and the beta stays limited to people on a paid plan.
- Role and flag are read from the database on every request, so a downgrade or a switch-off stops the next call, even for a token already issued.

## Consequences

- A new signup is a `GUEST`, so nobody gets MCP at signup. It starts when their role becomes `MEMBER`.
- The admin table shows a `GUEST` row as not in the plan, because the flag value does not matter for them.
- Changing which plans include MCP means changing the guard. If that becomes frequent, move the rule into plan data and reopen this decision.
- Re-running the seed overwrites plan `features` on an existing database. Add the MCP line there through the admin Plans page instead.
- Rollout order matters: ship the GUEST block first, and the default plus the migration after the connect guide and the consent scope text are live.
