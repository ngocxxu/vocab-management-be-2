import { CanActivate, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { McpNotFoundException } from '../exceptions';

/** While MCP_ENABLED is off the endpoint and its metadata do not exist: every route answers 404. */
@Injectable()
export class McpEnabledGuard implements CanActivate {
    public constructor(private readonly configService: ConfigService) {}

    public canActivate(): boolean {
        if (!this.configService.get<boolean>('mcp.enabled')) {
            throw new McpNotFoundException();
        }
        return true;
    }
}
