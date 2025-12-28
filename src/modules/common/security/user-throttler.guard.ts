import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ThrottlerLimitDetail } from '@nestjs/throttler/dist/throttler.guard.interface';
import { User } from '@prisma/client';

@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
    protected async getTracker(req: Record<string, unknown>): Promise<string> {
        const user = (await req.user) as User | undefined;
        if (user?.id) {
            return `user-${user.id}`;
        }

        const ip = req.ip as string | undefined;
        return ip || 'unknown';
    }

    protected async throwThrottlingException(
        context: ExecutionContext,
        throttlerLimitDetail: ThrottlerLimitDetail,
    ): Promise<void> {
        await super.throwThrottlingException(context, throttlerLimitDetail);
    }
}
