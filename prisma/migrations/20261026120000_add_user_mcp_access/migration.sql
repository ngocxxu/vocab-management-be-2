-- AlterTable
-- Existing users get false: the public MCP stays off for everyone until an admin turns it on (#21).
ALTER TABLE "user" ADD COLUMN "mcp_access" BOOLEAN NOT NULL DEFAULT false;
