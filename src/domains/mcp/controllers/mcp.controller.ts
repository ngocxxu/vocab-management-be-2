import { AuthUser, Public, Roles, RolesGuard } from '@/auth';
import { LoggerService } from '@/shared/services/logger.service';
import { captureSentryException } from '@/shared/utils/sentry.util';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { All, Controller, Get, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { Request, Response } from 'express';

import { MCP_IP_LIMIT_PER_MINUTE, MCP_METADATA_PATH, MCP_SCOPES } from '../constants';
import { McpMethodNotAllowedException } from '../exceptions';
import { McpAuthGuard, McpEnabledGuard, McpRequestGuard } from '../guards';
import { McpServerService } from '../services';

const JSON_RPC_INTERNAL_ERROR = -32603;

interface ProtectedResourceMetadata {
    resource: string;
    authorization_servers: string[];
    scopes_supported: string[];
    bearer_methods_supported: string[];
}

/**
 * The public MCP endpoint: stateless Streamable HTTP with JSON responses. Both routes are `@Public()` for the global
 * auth guard, which only accepts web-app tokens. `McpAuthGuard` authenticates the MCP route with an MCP-audience token.
 */
@ApiTags('MCP')
@ApiBearerAuth()
@Controller()
@Public()
export class McpController {
    public constructor(
        private readonly configService: ConfigService,
        private readonly mcpServerService: McpServerService,
        private readonly logger: LoggerService,
    ) {}

    /** RFC 9728 protected-resource metadata: tells an MCP client which authorization server to sign in with and which scopes exist. */
    @Get(MCP_METADATA_PATH)
    @UseGuards(McpEnabledGuard)
    @ApiOperation({ summary: 'OAuth protected-resource metadata of the MCP endpoint' })
    @ApiResponse({ status: 200, description: 'The resource URL, the Auth0 issuer and the supported scopes' })
    @ApiResponse({ status: 404, description: 'MCP is disabled' })
    public getProtectedResourceMetadata(): ProtectedResourceMetadata {
        return {
            resource: this.configService.getOrThrow<string>('mcp.resourceUrl'),
            authorization_servers: [this.configService.getOrThrow<string>('auth0.issuer')],
            scopes_supported: Object.values(MCP_SCOPES),
            bearer_methods_supported: ['header'],
        };
    }

    /** Per-IP limit before sign-in (#17). Per-user limits are #24. */
    @Post('mcp')
    @UseGuards(McpEnabledGuard, McpRequestGuard, McpAuthGuard, RolesGuard)
    @Roles(Object.values(UserRole))
    @Throttle({ default: { limit: MCP_IP_LIMIT_PER_MINUTE, ttl: 60000 } })
    @ApiOperation({ summary: 'MCP endpoint (Streamable HTTP, JSON responses)' })
    @ApiResponse({ status: 200, description: 'A JSON-RPC response' })
    @ApiResponse({ status: 401, description: 'No valid MCP access token; `WWW-Authenticate` points at the metadata' })
    @ApiResponse({ status: 404, description: 'MCP is disabled' })
    public async handle(@Req() request: Request & { authUser?: AuthUser }, @Res() response: Response): Promise<void> {
        const { authUser } = request;
        if (!authUser) {
            throw new UnauthorizedException();
        }

        const server = this.mcpServerService.createServer({ userId: authUser.id, scopes: authUser.scopes ?? [] });
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
        response.on('close', () => {
            void transport.close();
            void server.close();
        });

        try {
            await server.connect(transport);
            await transport.handleRequest(request, response, request.body);
        } catch (error) {
            this.logger.error(`MCP request failed: ${error instanceof Error ? error.name : 'unknown error'}`);
            captureSentryException(error, { tags: { mcp_stage: 'transport' } });
            if (!response.headersSent) {
                response.status(500).json({ jsonrpc: '2.0', error: { code: JSON_RPC_INTERNAL_ERROR, message: 'Internal server error' }, id: null });
            }
        }
    }

    /** The endpoint is stateless, so there is no SSE stream to open (GET) and no session to close (DELETE). */
    @All('mcp')
    @UseGuards(McpEnabledGuard)
    @ApiOperation({ summary: 'Only POST is supported' })
    @ApiResponse({ status: 405, description: 'Method not allowed' })
    public rejectMethod(@Res({ passthrough: true }) response: Response): never {
        response.setHeader('Allow', 'POST');
        throw new McpMethodNotAllowedException();
    }
}
