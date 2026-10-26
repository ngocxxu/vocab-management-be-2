import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

import { MCP_MAX_BODY_BYTES } from '../constants';
import { McpBadRequestException, McpForbiddenException, McpPayloadTooLargeException } from '../exceptions';

/** Transport rules for the MCP endpoint: HTTPS in production, a known Origin when one is sent, a small body. */
@Injectable()
export class McpRequestGuard implements CanActivate {
    public constructor(private readonly configService: ConfigService) {}

    public canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest<Request>();

        // `req.secure` follows the trusted proxy hops, so a TLS-terminating proxy still counts as HTTPS.
        if (this.configService.get<string>('app.nodeEnv') === 'production' && !request.secure) {
            throw new McpBadRequestException('https_required');
        }

        // Native and CLI clients send no Origin. A browser sends one, and only the configured origins may call.
        const { origin } = request.headers;
        if (origin && !this.configService.getOrThrow<string[]>('mcp.allowedOrigins').includes(origin)) {
            throw new McpForbiddenException('origin_not_allowed');
        }

        // ponytail: Content-Length is the cheap check; a chunked body falls back to the global JSON parser limit (100 kb).
        if (Number(request.headers['content-length'] ?? 0) > MCP_MAX_BODY_BYTES) {
            throw new McpPayloadTooLargeException('body_too_large');
        }

        return true;
    }
}
