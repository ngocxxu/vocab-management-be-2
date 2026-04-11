import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import type { AuthUser } from '../interfaces/auth-user.interface';

export const CurrentUser = createParamDecorator(
    (_data: unknown, ctx: ExecutionContext): AuthUser => {
        return ctx.switchToHttp().getRequest<{ authUser: AuthUser }>().authUser;
    },
);
