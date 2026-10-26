import { LoggerService } from '@/shared/services/logger.service';
import { captureSentryException } from '@/shared/utils/sentry.util';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, CallToolResult, ListToolsRequestSchema, Tool } from '@modelcontextprotocol/sdk/types.js';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import { MCP_ERROR_CODES, MCP_MAX_RESPONSE_BYTES, MCP_SERVER_NAME, MCP_SERVER_VERSION, McpErrorCode } from '../constants';
import { PublicMcpTool } from '../tools';
import { PublicMcpToolRegistry } from './public-mcp-tool-registry.service';

export interface McpCallContext {
    /** Internal `users.id` of the caller. */
    userId: string;
    /** Scopes of the caller's access token. */
    scopes: readonly string[];
}

@Injectable()
export class McpServerService {
    public constructor(
        private readonly registry: PublicMcpToolRegistry,
        private readonly logger: LoggerService,
    ) {}

    /** A new server per request. The endpoint is stateless, so nothing about a caller outlives its request. */
    public createServer(context: McpCallContext): Server {
        const server = new Server({ name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION }, { capabilities: { tools: {} } });
        server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: this.registry.list().map((tool) => this.describe(tool)) }));
        server.setRequestHandler(CallToolRequestSchema, async (request) => this.callTool(request.params.name, request.params.arguments, context));
        return server;
    }

    private describe(tool: PublicMcpTool): Tool {
        const schema = Object.fromEntries(Object.entries(z.toJSONSchema(tool.inputSchema)).filter(([key]) => key !== '$schema'));
        return { name: tool.name, description: tool.description, inputSchema: { ...schema, type: 'object' } };
    }

    private async callTool(name: string, args: unknown, context: McpCallContext): Promise<CallToolResult> {
        const tool = this.registry.get(name);
        if (!tool) {
            return this.failure(MCP_ERROR_CODES.UNKNOWN_TOOL, 'Unknown tool.');
        }

        if (!context.scopes.includes(tool.requiredScope)) {
            return this.failure(MCP_ERROR_CODES.INSUFFICIENT_SCOPE, `This tool needs the "${tool.requiredScope}" scope.`, { requiredScope: tool.requiredScope });
        }

        const parsed = tool.inputSchema.safeParse(args ?? {});
        if (!parsed.success) {
            const issues = parsed.error.issues.map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`);
            return this.failure(MCP_ERROR_CODES.INVALID_PARAMS, issues.join('; '));
        }

        try {
            const text = JSON.stringify(await tool.execute(parsed.data, { userId: context.userId }));
            if (Buffer.byteLength(text) > MCP_MAX_RESPONSE_BYTES) {
                return this.failure(MCP_ERROR_CODES.RESPONSE_TOO_LARGE, 'The result is too large. Ask for fewer items.');
            }
            return { content: [{ type: 'text', text }] };
        } catch (error) {
            // The caller gets a stable code only; the cause (database messages, stack traces) stays in the log and Sentry.
            this.logger.error(`MCP tool ${tool.name} failed: ${error instanceof Error ? error.name : 'unknown error'}`);
            captureSentryException(error, { tags: { mcp_tool: tool.name } });
            return this.failure(MCP_ERROR_CODES.INTERNAL_ERROR, 'The tool failed. Try again later.');
        }
    }

    private failure(code: McpErrorCode, message: string, details: Record<string, string> = {}): CallToolResult {
        return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: { code, message, ...details } }) }] };
    }
}
