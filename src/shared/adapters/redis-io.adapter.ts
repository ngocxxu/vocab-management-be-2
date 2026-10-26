import { INestApplicationContext, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import type { ServerOptions } from 'socket.io';

/**
 * Socket.IO over Redis, so a room emit from any pod reaches the user wherever the socket lives. Bull processors run in the
 * same process as the sockets, so without it a job that lands on the other pod loses its progress and result events.
 *
 * WebSocket only: the long-polling transport keeps its session in the memory of one pod and fails when requests alternate.
 */
export class RedisIoAdapter extends IoAdapter {
    private readonly logger = new Logger(RedisIoAdapter.name);
    private readonly clients: Redis[] = [];
    private adapterConstructor?: ReturnType<typeof createAdapter>;

    public constructor(private readonly appContext: INestApplicationContext) {
        super(appContext);
    }

    public connectToRedis(): void {
        const redisUrl = this.appContext.get(ConfigService).getOrThrow<string>('redis.url');
        const publisher = new Redis(redisUrl, {
            retryStrategy: (times: number) => Math.min(times * 50, 2000),
            maxRetriesPerRequest: null,
            enableReadyCheck: true,
        });
        const subscriber = publisher.duplicate();

        for (const client of [publisher, subscriber]) {
            client.on('error', (error: Error) => {
                this.logger.error(`Socket.IO Redis adapter error: ${error.message}`, error.stack);
            });
            this.clients.push(client);
        }

        this.adapterConstructor = createAdapter(publisher, subscriber);
    }

    public override createIOServer(port: number, options?: ServerOptions): unknown {
        const server = super.createIOServer(port, { ...options, transports: ['websocket'] }) as { adapter: (constructor: unknown) => void };
        if (this.adapterConstructor) {
            server.adapter(this.adapterConstructor);
        }

        return server;
    }

    public override async dispose(): Promise<void> {
        await super.dispose();
        await Promise.all(this.clients.map(async (client) => client.quit()));
    }
}
