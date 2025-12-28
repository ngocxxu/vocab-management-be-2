import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RedisKeyManager, RedisPrefix } from '../util/redis-key.util';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
    private redisClient: Redis;
    private readonly logger = new Logger(RedisService.name);

    public constructor(private readonly configService: ConfigService) {}

    public get client(): Redis {
        return this.redisClient;
    }

    public async onModuleInit(): Promise<void> {
        const redisUrl = this.configService.get<string>('REDIS_URL');
        if (!redisUrl) {
            throw new Error('REDIS_URL environment variable is required');
        }

        this.redisClient = new Redis(redisUrl, {
            lazyConnect: true,
            retryStrategy: (times: number) => {
                const delay = Math.min(times * 50, 2000);
                return delay;
            },
            maxRetriesPerRequest: 3,
            enableReadyCheck: true,
        });

        this.redisClient.on('connect', () => {
            this.logger.log('Redis client connected');
        });

        this.redisClient.on('error', (error: Error) => {
            this.logger.error(`Redis client error: ${error.message}`, error.stack);
        });

        this.redisClient.on('ready', () => {
            this.logger.log('Redis client ready');
        });

        this.redisClient.on('close', () => {
            this.logger.warn('Redis client connection closed');
        });

        this.redisClient.on('reconnecting', () => {
            this.logger.log('Redis client reconnecting...');
        });

        if (!this.redisClient.status || this.redisClient.status === 'end') {
            await this.redisClient.connect();
        }
    }

    public async onModuleDestroy(): Promise<void> {
        if (this.redisClient) {
            await this.redisClient.quit();
            this.logger.log('Redis client disconnected');
        }
    }

    public async set(prefix: RedisPrefix, key: string, value: string, ttl?: number): Promise<void> {
        const fullKey = RedisKeyManager.generateKey(prefix, key);
        const finalTtl = ttl ?? this.configService.get<number>('redis.ttl') ?? 3600;
        await this.redisClient.setex(fullKey, finalTtl, value);
    }

    public async get(prefix: RedisPrefix, key: string): Promise<string | null> {
        const fullKey = RedisKeyManager.generateKey(prefix, key);
        return this.redisClient.get(fullKey);
    }

    public async del(prefix: RedisPrefix, key: string): Promise<number> {
        const fullKey = RedisKeyManager.generateKey(prefix, key);
        return this.redisClient.del(fullKey);
    }

    public async jsonSet(
        prefix: RedisPrefix,
        key: string,
        data: unknown,
        ttl?: number,
    ): Promise<void> {
        const fullKey = RedisKeyManager.generateKey(prefix, key);
        const finalTtl = ttl ?? this.configService.get<number>('redis.ttl') ?? 3600;

        const pipeline = this.redisClient.pipeline();
        pipeline.call('JSON.SET', fullKey, '$', JSON.stringify(data));
        if (finalTtl > 0) {
            pipeline.expire(fullKey, finalTtl);
        }
        await pipeline.exec();
    }

    public async jsonGet<T>(prefix: RedisPrefix, key: string): Promise<T | null> {
        const fullKey = RedisKeyManager.generateKey(prefix, key);
        const result = (await this.redisClient.call('JSON.GET', fullKey, '$')) as string;
        if (!result) return null;

        const parsed = JSON.parse(result) as T;
        return (Array.isArray(parsed) ? parsed[0] : parsed) as T;
    }

    public async clearByPrefix(prefix: RedisPrefix): Promise<number> {
        const pattern = RedisKeyManager.getPatternByPrefix(prefix);
        const keys = await this.redisClient.keys(pattern);
        if (keys.length > 0) {
            return this.redisClient.del(...keys);
        }
        return 0;
    }

    public async getKeysByPrefix(prefix: RedisPrefix): Promise<string[]> {
        const pattern = RedisKeyManager.getPatternByPrefix(prefix);
        return this.redisClient.keys(pattern);
    }

    public async countByPrefix(prefix: RedisPrefix): Promise<number> {
        const keys = await this.getKeysByPrefix(prefix);
        return keys.length;
    }

    public async flushdb(): Promise<void> {
        await this.redisClient.flushdb();
    }
}
