import { RedisPubSubService } from '@/shared';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { CHAT_CANCEL_CHANNEL } from '../constants';

/**
 * The AbortController of a chat run lives on the pod that runs the job, while the cancel arrives on the pod that holds the
 * socket. Cancels therefore go through Redis, and every pod aborts the run it owns.
 */
@Injectable()
export class AbortControllerRegistry implements OnApplicationBootstrap {
    private readonly logger = new Logger(AbortControllerRegistry.name);
    private readonly controllers = new Map<string, AbortController>();

    public constructor(private readonly redisPubSub: RedisPubSubService) {}

    public onApplicationBootstrap(): void {
        this.redisPubSub.subscribe(CHAT_CANCEL_CHANNEL, (message: string) => this.handleCancelMessage(message));
    }

    public create(userId: string): AbortSignal {
        this.controllers.get(userId)?.abort();
        const controller = new AbortController();
        this.controllers.set(userId, controller);
        return controller.signal;
    }

    /** Aborts the run of this pod only. */
    public abort(userId: string): void {
        this.controllers.get(userId)?.abort();
    }

    /** Aborts the run wherever it lives: this pod at once, any other pod through Redis. */
    public async requestAbort(userId: string): Promise<void> {
        this.abort(userId);
        try {
            await this.redisPubSub.publish(CHAT_CANCEL_CHANNEL, { userId });
        } catch (error: unknown) {
            // The Redis cancel flag still stops the run at its next check.
            this.logger.warn(`Failed to publish chat cancel for userId=${userId}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    public delete(userId: string): void {
        this.controllers.delete(userId);
    }

    private handleCancelMessage(message: string): void {
        try {
            const payload = JSON.parse(message) as { userId?: unknown };
            if (typeof payload.userId === 'string') {
                this.abort(payload.userId);
            }
        } catch {
            this.logger.warn('Ignored an unreadable chat cancel message');
        }
    }
}
