-- AlterTable
-- MCP access is on by default. The plan decides who may use MCP (GUEST is blocked in the MCP guard), and this flag is the admin's per-user off-switch.
-- Existing rows are switched on too, so current MEMBERs and ADMINs get the benefit the plan lists (#21).
ALTER TABLE "user" ALTER COLUMN "mcp_access" SET DEFAULT true;
UPDATE "user" SET "mcp_access" = true;
