import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisPubSubService implements OnModuleInit, OnModuleDestroy {
    private publisher: Redis;
    private subscriber: Redis;
    private readonly logger = new Logger(RedisPubSubService.name);
    private readonly handlers = new Map<string, Set<(message: string) => void>>();

    public constructor(private readonly configService: ConfigService) {}

    public async onModuleInit(): Promise<void> {
        const redisUrl = this.configService.getOrThrow<string>('redis.url');
        const opts = {
            lazyConnect: true,
            retryStrategy: (times: number) => Math.min(times * 50, 2000),
            maxRetriesPerRequest: null,
            enableReadyCheck: true,
        };

        this.publisher = new Redis(redisUrl, opts);
        this.subscriber = new Redis(redisUrl, opts);

        this.subscriber.on('message', (channel: string, message: string) => {
            const channelHandlers = this.handlers.get(channel);
            if (channelHandlers) {
                for (const handler of channelHandlers) {
                    handler(message);
                }
            }
        });

        this.publisher.on('error', (error: Error) => {
            this.logger.error(`PubSub publisher error: ${error.message}`, error.stack);
        });

        this.subscriber.on('error', (error: Error) => {
            this.logger.error(`PubSub subscriber error: ${error.message}`, error.stack);
        });

        await Promise.all([this.publisher.connect(), this.subscriber.connect()]);
        this.logger.log('RedisPubSubService connected');
    }

    public async onModuleDestroy(): Promise<void> {
        await Promise.all([this.publisher.quit(), this.subscriber.quit()]);
        this.logger.log('RedisPubSubService disconnected');
    }

    public async publish(channel: string, payload: unknown): Promise<void> {
        await this.publisher.publish(channel, JSON.stringify(payload));
    }

    public subscribe(channel: string, handler: (message: string) => void): void {
        if (!this.handlers.has(channel)) {
            this.handlers.set(channel, new Set());
            void this.subscriber.subscribe(channel);
        }
        this.handlers.get(channel)?.add(handler);
    }

    public unsubscribe(channel: string, handler?: (message: string) => void): void {
        const channelHandlers = this.handlers.get(channel);
        if (!channelHandlers) return;

        if (handler) {
            channelHandlers.delete(handler);
        } else {
            channelHandlers.clear();
        }

        if (channelHandlers.size === 0) {
            this.handlers.delete(channel);
            void this.subscriber.unsubscribe(channel);
        }
    }

    public async subscribeOnce(channel: string, timeoutMs: number): Promise<string> {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.unsubscribe(channel, handler);
                reject(new Error(`Timeout waiting for channel ${channel}`));
            }, timeoutMs);

            const handler = (message: string): void => {
                clearTimeout(timer);
                this.unsubscribe(channel, handler);
                resolve(message);
            };

            this.subscribe(channel, handler);
        });
    }
}
