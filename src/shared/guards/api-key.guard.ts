import { ApiKeyUnauthorizedException } from '@/domains/identity/api-key/exceptions';
import { ApiKeyWithFolder } from '@/domains/identity/api-key/repositories';
import { ApiKeyService } from '@/domains/identity/api-key/services';
import { PrismaService } from '@/shared/services/prisma.service';
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ApiKeyScope, User } from '@prisma/client';
import { Request } from 'express';

export interface RequestWithApiKey extends Request {
    apiKey?: ApiKeyWithFolder;
    currentUser?: User;
}

const API_KEY_HEADER = 'x-api-key';

@Injectable()
export class ApiKeyGuard implements CanActivate {
    public constructor(
        private readonly apiKeyService: ApiKeyService,
        private readonly prismaService: PrismaService,
    ) {}

    public async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<RequestWithApiKey>();
        const rawKey = request.headers[API_KEY_HEADER];

        if (typeof rawKey !== 'string' || !rawKey) {
            throw new ApiKeyUnauthorizedException('Missing X-Api-Key header');
        }

        const apiKey = await this.apiKeyService.authenticate(rawKey, ApiKeyScope.QUICK_ADD_VOCAB);
        const user = await this.prismaService.user.findUnique({ where: { id: apiKey.userId } });

        request.apiKey = apiKey;
        request.currentUser = user ?? undefined;

        return true;
    }
}
