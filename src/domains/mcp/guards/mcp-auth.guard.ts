import { AuthIdentityService, AuthTokenService, AuthUser } from '@/auth';
import { bindAuthUserToRequest } from '@/auth/utils/bind-request-user.util';
import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { User, UserRole } from '@prisma/client';
import { Request, Response } from 'express';

import { MCP_SCOPES } from '../constants';
import { getMetadataUrl } from '../utils';

/**
 * Authenticates an MCP request with an Auth0 access token issued for the MCP audience (the MCP resource URL).
 * A missing or bad token gets a 401 whose `WWW-Authenticate` header points at the protected-resource metadata,
 * which is how an MCP client discovers where to sign in.
 */
@Injectable()
export class McpAuthGuard implements CanActivate {
    public constructor(
        private readonly configService: ConfigService,
        private readonly authTokenService: AuthTokenService,
        private readonly authIdentityService: AuthIdentityService,
    ) {}

    public async canActivate(context: ExecutionContext): Promise<boolean> {
        const http = context.switchToHttp();
        const request = http.getRequest<Request & { authUser?: AuthUser; currentUser?: User }>();
        const response = http.getResponse<Response>();
        const resourceUrl = this.configService.getOrThrow<string>('mcp.resourceUrl');

        const token = this.authTokenService.extractBearerToken(request);
        if (!token) {
            throw this.challenge(response, resourceUrl);
        }

        try {
            const authUser = await this.authTokenService.verifyAccessToken(token, resourceUrl);
            // An unknown identity or a deactivated user is rejected here, the same way as on the REST routes.
            await bindAuthUserToRequest(this.authIdentityService, request, authUser);
        } catch (error) {
            if (error instanceof UnauthorizedException) {
                throw this.challenge(response, resourceUrl, 'invalid_token');
            }
            throw error;
        }

        // Role and flag are read from the database on every request, so a downgrade or an admin switch-off stops the next call, even for a token already issued (#21).
        // The plan is the entitlement: GUEST (the Free plan) has no MCP. The flag is the admin's per-user off-switch.
        if (request.currentUser?.role === UserRole.GUEST) {
            throw new ForbiddenException('mcp_requires_plan');
        }
        if (!request.currentUser?.mcpAccess) {
            throw new ForbiddenException('mcp_access_disabled');
        }

        return true;
    }

    private challenge(response: Response, resourceUrl: string, error?: 'invalid_token'): UnauthorizedException {
        const params = [`resource_metadata="${getMetadataUrl(resourceUrl)}"`, `scope="${MCP_SCOPES.READ}"`, ...(error ? [`error="${error}"`] : [])];
        response.setHeader('WWW-Authenticate', `Bearer ${params.join(', ')}`);
        return new UnauthorizedException(error ?? 'No authentication token provided');
    }
}
