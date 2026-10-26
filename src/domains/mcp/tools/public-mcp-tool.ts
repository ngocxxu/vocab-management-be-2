import { z } from 'zod';

import { McpScope } from '../constants';

export interface McpToolContext {
    /** Internal `users.id` of the signed-in caller. Every query a tool makes is scoped by it. */
    userId: string;
}

/** A tool the public MCP exposes. Only tools listed in `PublicMcpToolRegistry` are discoverable or callable. */
export interface PublicMcpTool {
    name: string;
    description: string;
    /** The OAuth scope a token needs to call this tool. */
    requiredScope: McpScope;
    /** Use `z.strictObject` so unknown keys are rejected. */
    inputSchema: z.ZodType;
    execute(input: unknown, context: McpToolContext): Promise<unknown>;
}

export interface PublicMcpToolDefinition<S extends z.ZodType> {
    name: string;
    description: string;
    requiredScope: McpScope;
    inputSchema: S;
    execute(input: z.output<S>, context: McpToolContext): Promise<unknown>;
}

export function definePublicTool<S extends z.ZodType>(definition: PublicMcpToolDefinition<S>): PublicMcpTool {
    return {
        ...definition,
        // The server parses the arguments with `inputSchema` before it calls `execute`, so this only restores the parsed type.
        execute: async (input, context) => definition.execute(input as z.output<S>, context),
    };
}
