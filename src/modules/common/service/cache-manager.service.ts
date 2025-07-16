import { Injectable } from '@nestjs/common';
import { RedisService } from '../provider/redis.provider';
import { RedisPrefix } from '../util/redis-key.util';

@Injectable()
export class CacheManagerService {
    public constructor(private readonly redisService: RedisService) {}

    public async clearAllCaches(): Promise<void> {
        const prefixes = Object.values(RedisPrefix);
        for (const prefix of prefixes) {
            await this.redisService.clearByPrefix(prefix);
        }
    }

    public async getCacheStats(): Promise<Record<string, number>> {
        const stats: Record<string, number> = {};
        const prefixes = Object.values(RedisPrefix);

        for (const prefix of prefixes) {
            stats[prefix] = await this.redisService.countByPrefix(prefix);
        }

        return stats;
    }

    public async clearCacheByPrefix(prefix: RedisPrefix): Promise<number> {
        return this.redisService.clearByPrefix(prefix);
    }

    public async getKeysByPrefix(prefix: RedisPrefix): Promise<string[]> {
        return this.redisService.getKeysByPrefix(prefix);
    }
}
