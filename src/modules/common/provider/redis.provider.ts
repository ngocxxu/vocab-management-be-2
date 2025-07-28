import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RedisKeyManager, RedisPrefix } from '../util/redis-key.util';
import { LoggerService } from './logger.service';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
    private redisClient: Redis;
    private readonly logger = new LoggerService();

    public constructor(private readonly configService: ConfigService) {}

    public async onModuleInit() {
        try {
            // Check if we should use Upstash (production) or local Redis
            const useUpstash = process.env.SWITCH_REDIS === 'true' || process.env.NODE_ENV === 'production';

            if (useUpstash) {
                // Use Upstash Redis (production)
                const redisUrl = process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL;
                if (!redisUrl) {
                    throw new Error('REDIS_URL or UPSTASH_REDIS_URL environment variable is required for production');
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

                this.logger.info('Using Upstash Redis (production configuration)');
            } else {
                // Use local Redis (development)
                this.redisClient = new Redis({
                    host: this.configService.get('redis.host'),
                    port: this.configService.get('redis.port'),
                    password: this.configService.get('redis.password'),
                    db: this.configService.get('redis.db'),
                    retryStrategy: () => this.configService.get('redis.retryDelayOnFailover'),
                    maxRetriesPerRequest: this.configService.get('redis.maxRetriesPerRequest'),
                    enableReadyCheck: this.configService.get('redis.enableReadyCheck'),
                    lazyConnect: true,
                });

                this.logger.info('Using local Redis (development configuration)');
            }

            // Set up event listeners
            this.redisClient.on('connect', () => {
                this.logger.info('Redis client connected');
            });

            this.redisClient.on('error', (error: Error) => {
                this.logger.error(`Redis client error: ${error.message}`);
            });

            this.redisClient.on('ready', () => {
                this.logger.info('Redis client ready');
            });

            this.redisClient.on('close', () => {
                this.logger.error('Redis client connection closed');
            });

            this.redisClient.on('reconnecting', () => {
                this.logger.info('Redis client reconnecting...');
            });

            // Connect to Redis (only if not already connected)
            if (!this.redisClient.status || this.redisClient.status === 'end') {
                await this.redisClient.connect();
            }
        } catch (error: unknown) {
            if (error instanceof Error) {
                this.logger.error(`Failed to connect to Redis: ${error.message}`);
            } else {
                this.logger.error('Failed to connect to Redis: Unknown error');
            }
            throw error;
        }
    }

    public async onModuleDestroy() {
        if (this.redisClient) {
            await this.redisClient.quit();
            this.logger.info('Redis client disconnected');
        }
    }

    // Prefix-specific methods for string values
    public async setWithPrefix(
        prefix: RedisPrefix,
        key: string,
        value: string,
        ttl?: number,
    ): Promise<void> {
        const fullKey = RedisKeyManager.generateKey(prefix, key);
        const finalTtl = ttl || this.configService.get('redis.ttl') || 3600;
        await this.redisClient.setex(fullKey, finalTtl, value);
    }

    public async getWithPrefix(prefix: RedisPrefix, key: string): Promise<string | null> {
        const fullKey = RedisKeyManager.generateKey(prefix, key);
        return this.redisClient.get(fullKey);
    }

    public async delWithPrefix(prefix: RedisPrefix, key: string): Promise<number> {
        const fullKey = RedisKeyManager.generateKey(prefix, key);
        return this.redisClient.del(fullKey);
    }

    public async existsWithPrefix(prefix: RedisPrefix, key: string): Promise<number> {
        const fullKey = RedisKeyManager.generateKey(prefix, key);
        return this.redisClient.exists(fullKey);
    }

    // Prefix-specific methods for hash operations (objects)
    public async hsetWithPrefix(
        prefix: RedisPrefix,
        key: string,
        field: string,
        value: string,
    ): Promise<number> {
        const fullKey = RedisKeyManager.generateKey(prefix, key);
        return this.redisClient.hset(fullKey, field, value);
    }

    public async hgetWithPrefix(
        prefix: RedisPrefix,
        key: string,
        field: string,
    ): Promise<string | null> {
        const fullKey = RedisKeyManager.generateKey(prefix, key);
        return this.redisClient.hget(fullKey, field);
    }

    public async hgetallWithPrefix(
        prefix: RedisPrefix,
        key: string,
    ): Promise<Record<string, string>> {
        const fullKey = RedisKeyManager.generateKey(prefix, key);
        return this.redisClient.hgetall(fullKey);
    }

    public async hdelWithPrefix(
        prefix: RedisPrefix,
        key: string,
        ...fields: string[]
    ): Promise<number> {
        const fullKey = RedisKeyManager.generateKey(prefix, key);
        return this.redisClient.hdel(fullKey, ...fields);
    }

    public async hexistsWithPrefix(
        prefix: RedisPrefix,
        key: string,
        field: string,
    ): Promise<number> {
        const fullKey = RedisKeyManager.generateKey(prefix, key);
        return this.redisClient.hexists(fullKey, field);
    }

    public async hkeysWithPrefix(prefix: RedisPrefix, key: string): Promise<string[]> {
        const fullKey = RedisKeyManager.generateKey(prefix, key);
        return this.redisClient.hkeys(fullKey);
    }

    public async hvalsWithPrefix(prefix: RedisPrefix, key: string): Promise<string[]> {
        const fullKey = RedisKeyManager.generateKey(prefix, key);
        return this.redisClient.hvals(fullKey);
    }

    public async hlenWithPrefix(prefix: RedisPrefix, key: string): Promise<number> {
        const fullKey = RedisKeyManager.generateKey(prefix, key);
        return this.redisClient.hlen(fullKey);
    }

    // Set object data as hash with TTL
    public async setObjectWithPrefix(
        prefix: RedisPrefix,
        key: string,
        data: Record<string, unknown>,
        ttl?: number,
    ): Promise<void> {
        const fullKey = RedisKeyManager.generateKey(prefix, key);
        const finalTtl = ttl || this.configService.get('redis.ttl') || 3600;

        // Convert object to hash fields
        const hashData: Record<string, string> = {};
        for (const [field, value] of Object.entries(data)) {
            hashData[field] = typeof value === 'string' ? value : JSON.stringify(value);
        }

        // Set hash fields
        if (Object.keys(hashData).length > 0) {
            await this.redisClient.hset(fullKey, hashData);
        }

        // Set TTL on the hash key
        if (finalTtl > 0) {
            await this.redisClient.expire(fullKey, finalTtl);
        }
    }

    // Get object data from hash
    public async getObjectWithPrefix<T>(prefix: RedisPrefix, key: string): Promise<T | null> {
        const fullKey = RedisKeyManager.generateKey(prefix, key);
        const hashData = await this.redisClient.hgetall(fullKey);

        if (!hashData || Object.keys(hashData).length === 0) {
            return null;
        }

        // Convert hash fields back to object
        const result: Record<string, unknown> = {};
        for (const [field, value] of Object.entries(hashData)) {
            try {
                // Try to parse as JSON, fallback to string
                result[field] = JSON.parse(value);
            } catch {
                result[field] = value;
            }
        }

        return result as T;
    }

    // Update specific fields in hash object
    public async updateObjectFieldsWithPrefix(
        prefix: RedisPrefix,
        key: string,
        fields: Record<string, unknown>,
    ): Promise<void> {
        const fullKey = RedisKeyManager.generateKey(prefix, key);

        const hashData: Record<string, string> = {};
        for (const [field, value] of Object.entries(fields)) {
            hashData[field] = typeof value === 'string' ? value : JSON.stringify(value);
        }

        if (Object.keys(hashData).length > 0) {
            await this.redisClient.hset(fullKey, hashData);
        }
    }

    // Clear all keys by prefix
    public async clearByPrefix(prefix: RedisPrefix): Promise<number> {
        const pattern = RedisKeyManager.getPatternByPrefix(prefix);
        const keys = await this.redisClient.keys(pattern);
        if (keys.length > 0) {
            return this.redisClient.del(...keys);
        }
        return 0;
    }

    // Get all keys by prefix
    public async getKeysByPrefix(prefix: RedisPrefix): Promise<string[]> {
        const pattern = RedisKeyManager.getPatternByPrefix(prefix);
        return this.redisClient.keys(pattern);
    }

    // Count keys by prefix
    public async countByPrefix(prefix: RedisPrefix): Promise<number> {
        const keys = await this.getKeysByPrefix(prefix);
        return keys.length;
    }

    // Basic operations (without prefix)
    public async set(key: string, value: string, ttl?: number): Promise<void> {
        const finalTtl = ttl || this.configService.get('redis.ttl') || 3600;
        await this.redisClient.setex(key, finalTtl, value);
    }

    public async get(key: string): Promise<string | null> {
        return this.redisClient.get(key);
    }

    public async del(key: string): Promise<number> {
        return this.redisClient.del(key);
    }

    public async exists(key: string): Promise<number> {
        return this.redisClient.exists(key);
    }

    // Hash operations (without prefix)
    public async hset(key: string, field: string, value: string): Promise<number> {
        return this.redisClient.hset(key, field, value);
    }

    public async hget(key: string, field: string): Promise<string | null> {
        return this.redisClient.hget(key, field);
    }

    public async hgetall(key: string): Promise<Record<string, string>> {
        return this.redisClient.hgetall(key);
    }

    public async hdel(key: string, ...fields: string[]): Promise<number> {
        return this.redisClient.hdel(key, ...fields);
    }

    public async hexists(key: string, field: string): Promise<number> {
        return this.redisClient.hexists(key, field);
    }

    public async hkeys(key: string): Promise<string[]> {
        return this.redisClient.hkeys(key);
    }

    public async hvals(key: string): Promise<string[]> {
        return this.redisClient.hvals(key);
    }

    public async hlen(key: string): Promise<number> {
        return this.redisClient.hlen(key);
    }

    // List operations
    public async lpush(key: string, ...values: string[]): Promise<number> {
        return this.redisClient.lpush(key, ...values);
    }

    public async rpop(key: string): Promise<string | null> {
        return this.redisClient.rpop(key);
    }

    // Set operations
    public async sadd(key: string, ...members: string[]): Promise<number> {
        return this.redisClient.sadd(key, ...members);
    }

    public async smembers(key: string): Promise<string[]> {
        return this.redisClient.smembers(key);
    }

    // Utility methods
    public async flushdb(): Promise<void> {
        await this.redisClient.flushdb();
    }

    public async ping(): Promise<string> {
        return this.redisClient.ping();
    }

    // RedisJSON methods for nested object caching
    public async jsonSetWithPrefix(
        prefix: RedisPrefix,
        key: string,
        data: unknown,
        ttl?: number,
    ): Promise<void> {
        const fullKey = RedisKeyManager.generateKey(prefix, key);
        await this.redisClient.call('JSON.SET', fullKey, '$', JSON.stringify(data));
        if (ttl && ttl > 0) {
            await this.redisClient.expire(fullKey, ttl);
        }
    }

    public async jsonGetWithPrefix<T>(
        prefix: RedisPrefix,
        key: string,
    ): Promise<T | null> {
        const fullKey = RedisKeyManager.generateKey(prefix, key);
        const result = await this.redisClient.call('JSON.GET', fullKey, '$') as string;
        if (!result) return null;

        const parsed = JSON.parse(result) as T;
        return (Array.isArray(parsed) ? parsed[0] : parsed) as T;
    }

    public getClient(): Redis {
        return this.redisClient;
    }
}
