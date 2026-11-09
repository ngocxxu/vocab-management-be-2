import { LoggerService } from '@/shared';
import { captureSentryException } from '@/shared/utils/sentry.util';
import { Injectable } from '@nestjs/common';
import axios from 'axios';
import CircuitBreaker from 'opossum';
import { AiModelCatalogRepository } from '../repositories';
import {
    CatalogKind,
    CatalogModel,
    CatalogProvider,
    CloudflareModelRaw,
    GeminiModelRaw,
    GroqModelRaw,
    OpenRouterModelRaw,
    mapCloudflareModels,
    mapGeminiModels,
    mapGroqModels,
    mapOpenRouterModels,
} from '../utils/ai-model-catalog.util';

const REQUEST_TIMEOUT_MS = 8_000;

// One breaker per provider: a Groq outage must not block Gemini.
const BREAKER_OPTIONS = {
    timeout: 10_000,
    errorThresholdPercentage: 50,
    resetTimeout: 30_000,
    volumeThreshold: 3,
};

export interface ModelCatalogResult {
    provider: CatalogProvider;
    kind: CatalogKind;
    models: CatalogModel[];
    /** True when the provider could not be reached, so `models` is the last good list or empty. */
    degraded: boolean;
}

@Injectable()
export class AiModelCatalogService {
    private readonly breakers = new Map<CatalogProvider, CircuitBreaker<[CatalogKind], CatalogModel[]>>();

    public constructor(
        private readonly repository: AiModelCatalogRepository,
        private readonly logger: LoggerService,
    ) {}

    /** Never throws: a provider failure answers with the last cached list (or none) and `degraded: true`. */
    public async list(provider: CatalogProvider, kind: CatalogKind): Promise<ModelCatalogResult> {
        const cached = await this.repository.findFresh(provider, kind);
        if (cached) {
            return { provider, kind, models: cached, degraded: false };
        }

        try {
            const models = await this.breakerFor(provider).fire(kind);
            await this.repository.save(provider, kind, models);
            return { provider, kind, models, degraded: false };
        } catch (error) {
            this.logger.warn(`Model catalog fetch failed for ${provider}/${kind}: ${error instanceof Error ? error.message : String(error)}`);
            captureSentryException(error, { tags: { provider, kind, area: 'ai-model-catalog' } });
            const stale = await this.repository.findStale(provider, kind);
            return { provider, kind, models: stale ?? [], degraded: true };
        }
    }

    private breakerFor(provider: CatalogProvider): CircuitBreaker<[CatalogKind], CatalogModel[]> {
        const existing = this.breakers.get(provider);
        if (existing) {
            return existing;
        }

        const breaker = new CircuitBreaker(async (kind: CatalogKind) => this.fetch(provider, kind), BREAKER_OPTIONS);
        breaker.on('open', () => this.logger.warn(`Model catalog circuit opened for ${provider}`));
        breaker.on('close', () => this.logger.info(`Model catalog circuit closed for ${provider}`));
        this.breakers.set(provider, breaker);
        return breaker;
    }

    private async fetch(provider: CatalogProvider, kind: CatalogKind): Promise<CatalogModel[]> {
        switch (provider) {
            case 'gemini': {
                // ponytail: one page of 200 covers today's ~60 models; follow nextPageToken if the list ever outgrows it
                const { data } = await axios.get<{ models?: GeminiModelRaw[] }>('https://generativelanguage.googleapis.com/v1beta/models', {
                    params: { pageSize: 200 },
                    headers: { 'x-goog-api-key': this.requireEnv('GEMINI_API_KEY') },
                    timeout: REQUEST_TIMEOUT_MS,
                });
                return mapGeminiModels(data.models ?? []);
            }

            case 'groq': {
                const { data } = await axios.get<{ data?: GroqModelRaw[] }>('https://api.groq.com/openai/v1/models', {
                    headers: { Authorization: `Bearer ${this.requireEnv('GROQ_API_KEY')}` },
                    timeout: REQUEST_TIMEOUT_MS,
                });
                return mapGroqModels(data.data ?? [], kind);
            }

            case 'openrouter': {
                // The OpenRouter model list is public, so no key is sent.
                const { data } = await axios.get<{ data?: OpenRouterModelRaw[] }>('https://openrouter.ai/api/v1/models', { timeout: REQUEST_TIMEOUT_MS });
                return mapOpenRouterModels(data.data ?? [], kind);
            }

            case 'cloudflare': {
                const accountId = this.requireEnv('CLOUDFLARE_ACCOUNT_ID');
                const { data } = await axios.get<{ result?: CloudflareModelRaw[] }>(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/models/search`, {
                    params: { task: kind === 'audio' ? 'Automatic Speech Recognition' : 'Text Generation', per_page: 100 },
                    headers: { Authorization: `Bearer ${this.requireEnv('CLOUDFLARE_AI_API_KEY')}` },
                    timeout: REQUEST_TIMEOUT_MS,
                });
                return mapCloudflareModels(data.result ?? []);
            }

            default:
                throw new Error(`Unsupported model catalog provider: ${String(provider)}`);
        }
    }

    private requireEnv(name: string): string {
        const value = process.env[name];
        if (!value) {
            throw new Error(`${name} environment variable is required`);
        }
        return value;
    }
}
