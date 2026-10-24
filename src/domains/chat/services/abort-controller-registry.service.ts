import { captureSentryException, LoggerService, RedisPubSubService } from '@/shared';
import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { CHAT_CANCEL_CHANNEL } from '../constants';

/**
 * The AbortController of a chat run lives on the pod that runs the job, while the cancel arrives on the pod that holds the
 * socket. Cancels therefore go through Redis, and every pod aborts the run it owns.
 */
@Injectable()
export class AbortControllerRegistry implements OnApplicationBootstrap {
    private readonly controllers = new Map<string, AbortController>();

    public constructor(
        private readonly redisPubSub: RedisPubSubService,
        private readonly logger: LoggerService,
    ) {}

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
            captureSentryException(error, { tags: { 'chat.cancel': 'publish_failed' } });
        }
    }

    public delete(userId: string): void {
        this.controllers.delete(userId);
    }

    private handleCancelMessage(message: string): void {
        try {
            const payload: unknown = JSON.parse(message);
            const userId = typeof payload === 'object' && payload !== null ? (payload as { userId?: unknown }).userId : undefined;
            if (typeof userId === 'string') {
                this.abort(userId);
            }
        } catch (error: unknown) {
            this.logger.warn('Ignored an unreadable chat cancel message');
            captureSentryException(error, { tags: { 'chat.cancel': 'unreadable_message' } });
        }
    }
}
