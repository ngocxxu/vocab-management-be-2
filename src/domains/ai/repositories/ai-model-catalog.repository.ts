import { LoggerService } from '@/shared';
import { RedisService } from '@/shared/services/redis.service';
import { RedisPrefix } from '@/shared/utils/redis-key.util';
import { Injectable } from '@nestjs/common';
import { CatalogKind, CatalogModel, CatalogProvider } from '../utils/ai-model-catalog.util';

const FRESH_TTL_SECONDS = 60 * 60;
// A provider outage should not empty the dropdown, so the last good list outlives the fresh copy by a week.
const STALE_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Read-through cache for model catalogs. A Redis failure reads as a miss and never fails the caller. */
@Injectable()
export class AiModelCatalogRepository {
    public constructor(
        private readonly redisService: RedisService,
        private readonly logger: LoggerService,
    ) {}

    public async findFresh(provider: CatalogProvider, kind: CatalogKind): Promise<CatalogModel[] | null> {
        return this.read(this.freshKey(provider, kind));
    }

    public async findStale(provider: CatalogProvider, kind: CatalogKind): Promise<CatalogModel[] | null> {
        return this.read(this.staleKey(provider, kind));
    }

    public async save(provider: CatalogProvider, kind: CatalogKind, models: CatalogModel[]): Promise<void> {
        const payload = JSON.stringify(models);
        try {
            await this.redisService.set(RedisPrefix.CACHE, this.freshKey(provider, kind), payload, FRESH_TTL_SECONDS);
            await this.redisService.set(RedisPrefix.CACHE, this.staleKey(provider, kind), payload, STALE_TTL_SECONDS);
        } catch (error) {
            this.logger.warn(`Model catalog cache write failed for ${provider}/${kind}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async read(key: string): Promise<CatalogModel[] | null> {
        try {
            const raw = await this.redisService.get(RedisPrefix.CACHE, key);
            return raw ? (JSON.parse(raw) as CatalogModel[]) : null;
        } catch (error) {
            this.logger.warn(`Model catalog cache read failed for ${key}: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }
    }

    private freshKey(provider: CatalogProvider, kind: CatalogKind): string {
        return `ai-models:${provider}:${kind}`;
    }

    private staleKey(provider: CatalogProvider, kind: CatalogKind): string {
        return `ai-models-stale:${provider}:${kind}`;
    }
}
