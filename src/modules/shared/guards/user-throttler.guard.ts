import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ThrottlerLimitDetail } from '@nestjs/throttler/dist/throttler.guard.interface';
import { User as SupabaseUser } from '@supabase/supabase-js';

interface RequestWithUser extends Record<string, unknown> {
    user?: SupabaseUser | Promise<SupabaseUser>;
    ip?: string;
}

function isSupabaseUser(user: unknown): user is SupabaseUser {
    return (
        typeof user === 'object' &&
        user !== null &&
        'id' in user &&
        typeof (user as { id: unknown }).id === 'string'
    );
}

function isString(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0;
}

@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
    protected async getTracker(req: Record<string, unknown>): Promise<string> {
        const request = req as RequestWithUser;
        const userValue = request.user;

        if (userValue) {
            const user = userValue instanceof Promise ? await userValue : userValue;
            if (isSupabaseUser(user) && isString(user.id)) {
                return `user-${user.id}`;
            }
        }

        const ip = request.ip;
        if (isString(ip)) {
            return ip;
        }

        return 'unknown';
    }

    protected async throwThrottlingException(
        context: ExecutionContext,
        throttlerLimitDetail: ThrottlerLimitDetail,
    ): Promise<void> {
        await super.throwThrottlingException(context, throttlerLimitDetail);
    }
}
