import type { AuthUser } from '../interfaces/auth-user.interface';
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest<{ authUser: AuthUser }>().authUser);
