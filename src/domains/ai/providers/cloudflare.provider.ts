import { ConfigService } from '@/domains/platform/config/services';
import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import { CLOUDFLARE_AI_MODEL_TIER } from '../utils/cloudflare-models.const';
import { ChatHistoryMessage, ChatParams, ChatResponse, GenerateContentOptions, IAiProvider } from './ai-provider.interface';
import { OpenAiCompatibleProvider } from './openai-compatible.provider';

type CloudflareToolCall = {
    name: string;
    arguments: Record<string, unknown>;
};

type CloudflareChatResult = {
    response: string | null;
    tool_calls?: CloudflareToolCall[];
};

type CloudflareApiResponse<T> = {
    result: T;
    success: boolean;
    errors: Array<{ message?: string; code?: number }>;
};

@Injectable()
export class CloudflareProvider extends OpenAiCompatibleProvider implements IAiProvider {
    protected readonly logger = new Logger(CloudflareProvider.name);
    protected readonly apiKey: string;
    protected readonly chatUrl = '';
    private readonly baseUrl: string;

    public constructor(private readonly configService: ConfigService) {
        super();
        const apiKey = process.env.CLOUDFLARE_AI_API_KEY;
        const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
        if (!apiKey) throw new Error('CLOUDFLARE_AI_API_KEY environment variable is required');
        if (!accountId) throw new Error('CLOUDFLARE_ACCOUNT_ID environment variable is required');
        this.apiKey = apiKey;
        this.baseUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run`;
    }

    public override async chat(params: ChatParams): Promise<ChatResponse> {
        const modelName = await this.getModelName();
        const url = `${this.baseUrl}/${modelName}`;
        const messages = this.buildOpenAiMessages(params.systemPrompt, params.history);
        const body = this.buildChatBody(modelName, messages, params);

        try {
            const response = await axios.post<CloudflareApiResponse<CloudflareChatResult>>(url, body, {
                headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
                signal: params.signal,
            });

            const result = response.data.result;

            if (result.tool_calls?.length) {
                const tc = result.tool_calls[0];
                return {
                    type: 'tool_call',
                    name: tc.name,
                    params: tc.arguments,
                    toolCallId: `cf-${Date.now()}`,
                };
            }

            return { type: 'text', content: result.response ?? '' };
        } catch (error) {
            this.handleApiError(error, 'chat', modelName);
            throw error;
        }
    }

    public async generateContent(prompt: string, userId?: string, options?: GenerateContentOptions): Promise<string> {
        if (options?.audioBuffer && options?.audioMimeType) {
            return this.transcribeAudio(options.audioBuffer, options.audioMimeType, '', userId);
        }

        const modelName = await this.getModelName(userId);
        const url = `${this.baseUrl}/${modelName}`;

        try {
            const response = await axios.post<CloudflareApiResponse<CloudflareChatResult>>(
                url,
                { messages: [{ role: 'user', content: prompt }] },
                { headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' }, signal: options?.signal },
            );

            const result = response.data.result;

            if (!result.response) {
                if (result.tool_calls?.length) {
                    this.logger.warn(`[CloudflareProvider] Model ${modelName} emitted tool_call without tools in request: ${result.tool_calls[0].name}`);
                } else {
                    this.logger.warn(`[CloudflareProvider] No text response from model ${modelName}`);
                }
                return '';
            }

            return result.response;
        } catch (error) {
            this.handleApiError(error, 'generateContent', modelName);
            throw error;
        }
    }

    public async transcribeAudio(audioBuffer: Buffer, mimeType: string, _sourceLanguage: string, userId?: string): Promise<string> {
        const modelName = await this.getAudioModelName(userId);
        const url = `${this.baseUrl}/${modelName}`;

        try {
            const response = await axios.post<CloudflareApiResponse<{ text?: string }>>(url, audioBuffer, {
                headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': mimeType },
            });

            const text = response.data.result?.text;

            if (!text) {
                throw new Error('No transcript received from Cloudflare AI');
            }

            return text.trim();
        } catch (error) {
            this.handleApiError(error, 'transcribeAudio', modelName);
            throw error;
        }
    }

    public async getModelName(userId?: string): Promise<string> {
        const configValue = await this.configService.getConfig(userId || null, 'ai.chat.model');
        if (configValue && typeof configValue === 'string') return configValue;
        const models = CLOUDFLARE_AI_MODEL_TIER.TEXT_GENERATION;
        return models[Math.floor(Math.random() * models.length)];
    }

    public async getAudioModelName(userId?: string): Promise<string> {
        const configValue = await this.configService.getConfig(userId || null, 'ai.audio.model');
        if (configValue && typeof configValue === 'string') return configValue;
        const models = CLOUDFLARE_AI_MODEL_TIER.AUDIO_TRANSCRIPTION;
        return models[Math.floor(Math.random() * models.length)];
    }

    // Cloudflare Workers AI: content must be string (no null)
    protected override buildOpenAiMessages(systemPrompt: string, history: ChatHistoryMessage[]): unknown[] {
        return super.buildOpenAiMessages(systemPrompt, history).map((m) => {
            const msg = m as { role: string; content: string | null; tool_calls?: unknown[] };
            return msg.content === null ? { ...msg, content: '' } : msg;
        });
    }

    protected override buildChatBody(_resolvedModel: string, messages: unknown[], params: ChatParams): Record<string, unknown> {
        const body: Record<string, unknown> = { messages };
        if (params.tools.length > 0) {
            body.tools = params.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
            body.tool_choice = 'auto';
        }
        return body;
    }

    protected handleApiError(error: unknown, operation: string, modelName: string): void {
        if (axios.isAxiosError(error)) {
            const axiosError = error as AxiosError<{ errors?: Array<{ message?: string; code?: number }> }>;
            const statusCode = axiosError.response?.status;
            const errors = axiosError.response?.data?.errors;
            const errMsg = errors?.[0]?.message ?? '';

            let errorMessage = `Cloudflare AI ${operation} failed`;
            if (statusCode === 401) {
                errorMessage = 'Cloudflare AI: Unauthorized. Please check your API key.';
            } else if (statusCode === 429) {
                errorMessage = 'Cloudflare AI: Rate limit exceeded. Please try again later.';
            } else if (statusCode === 400) {
                errorMessage = `Cloudflare AI: Bad request. ${errMsg}`;
            } else if (statusCode) {
                errorMessage = `Cloudflare AI: Request failed with status ${statusCode}. ${errMsg}`;
            }

            this.logger.error(errorMessage, { statusCode, errors, model: modelName, operation });
        } else {
            this.logger.error(`Cloudflare AI ${operation} error:`, error);
        }
    }
}
