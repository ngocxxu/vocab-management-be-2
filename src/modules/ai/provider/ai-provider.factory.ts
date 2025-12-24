import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '../../config/service';
import { IAiProvider } from './ai-provider.interface';
import { GeminiProvider } from './gemini.provider';
import { GroqProvider } from './groq.provider';
import { OpenRouterProvider } from './openrouter.provider';

export type AiProviderType = 'gemini' | 'openrouter' | 'groq';

@Injectable()
export class AiProviderFactory {
    private readonly logger = new Logger(AiProviderFactory.name);
    private readonly providerCache = new Map<string, IAiProvider>();

    public constructor(private readonly configService: ConfigService) {}

    public async getProvider(userId?: string): Promise<IAiProvider> {
        const providerType = await this.getProviderType(userId);
        const cacheKey = `${providerType}:${userId || 'system'}`;

        if (this.providerCache.has(cacheKey)) {
            return this.providerCache.get(cacheKey) as IAiProvider;
        }

        const provider = this.createProvider(providerType);
        this.providerCache.set(cacheKey, provider);

        return provider;
    }

    public async getAudioProvider(userId?: string): Promise<IAiProvider> {
        const providerType = await this.getAudioProviderType(userId);
        const cacheKey = `audio:${providerType}:${userId || 'system'}`;

        if (this.providerCache.has(cacheKey)) {
            return this.providerCache.get(cacheKey) as IAiProvider;
        }

        const provider = this.createProvider(providerType);
        this.providerCache.set(cacheKey, provider);

        return provider;
    }

    private async getProviderType(userId?: string): Promise<AiProviderType> {
        const configValue = await this.configService.getConfig(userId || null, 'ai.provider');

        if (configValue && typeof configValue === 'string') {
            const provider = configValue.toLowerCase() as AiProviderType;
            if (['gemini', 'openrouter', 'groq'].includes(provider)) {
                return provider;
            }
            this.logger.warn(`Invalid ai.provider value: ${configValue}, defaulting to gemini`);
        }

        return 'gemini';
    }

    private async getAudioProviderType(userId?: string): Promise<AiProviderType> {
        const audioProviderConfig = await this.configService.getConfig(
            userId || null,
            'ai.audio.provider',
        );

        if (audioProviderConfig && typeof audioProviderConfig === 'string') {
            const provider = audioProviderConfig.toLowerCase() as AiProviderType;
            if (['gemini', 'openrouter', 'groq'].includes(provider)) {
                return provider;
            }
            this.logger.warn(
                `Invalid ai.audio.provider value: ${audioProviderConfig}, falling back to ai.provider`,
            );
        }

        return this.getProviderType(userId);
    }

    private createProvider(providerType: AiProviderType): IAiProvider {
        switch (providerType) {
            case 'gemini':
                this.validateApiKey('GEMINI_API_KEY');
                return new GeminiProvider(this.configService);

            case 'openrouter':
                this.validateApiKey('OPENROUTER_API_KEY');
                return new OpenRouterProvider(this.configService);

            case 'groq':
                this.validateApiKey('GROQ_API_KEY');
                return new GroqProvider(this.configService);

            default:
                this.logger.warn(
                    `Unknown provider type: ${String(providerType)}, defaulting to gemini`,
                );
                this.validateApiKey('GEMINI_API_KEY');
                return new GeminiProvider(this.configService);
        }
    }

    private validateApiKey(keyName: string): void {
        const apiKey = process.env[keyName];
        if (!apiKey) {
            throw new Error(`${keyName} environment variable is required`);
        }
    }
}
