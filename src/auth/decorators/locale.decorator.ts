import { AppLocale, parseAppLocale } from '@/shared/utils/locale.util';
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** Reads the request's Accept-Language header and maps it to a supported app locale. */
export function resolveRequestLocale(ctx: ExecutionContext): AppLocale {
    const request = ctx.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>();
    return parseAppLocale(request.headers['accept-language']);
}

export const Locale = createParamDecorator((_data: unknown, ctx: ExecutionContext): AppLocale => resolveRequestLocale(ctx));
