import { ConfigService } from '@/domains/platform/config/services';
import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosError } from 'axios';
// eslint-disable-next-line import/no-extraneous-dependencies
import FormData from 'form-data';
import { GenerateContentOptions, IAiProvider } from './ai-provider.interface';

@Injectable()
export class OmniRouteProvider implements IAiProvider {
    private static readonly DEFAULT_TEXT_MODEL = 'general-text-combo';
    private static readonly DEFAULT_AUDIO_MODEL = 'deepgram/nova-3';
    private static readonly AUDIO_MODEL_PROVIDER_MAP: Record<string, string> = {
        'gemini-2.5-flash-native-audio-latest': 'google',
        'gemini-2.5-flash-native-audio-preview-09-2025': 'google',
        'gemini-2.5-flash-native-audio-preview-12-2025': 'google',
        'gemini-3.1-flash-live-preview': 'google',
        'gemini-3.5-live-translate-preview': 'google',
        'whisper-large-v3': 'groq',
        'whisper-large-v3-turbo': 'groq',
        'distil-whisper-large-v3-en': 'groq',
        'nova-3': 'deepgram',
        'nova-2': 'deepgram',
        'whisper-large': 'deepgram',
        'whisper-1': 'openai',
        'gpt-4o-transcription': 'openai',
        'universal-3-pro': 'assemblyai',
        'universal-2': 'assemblyai',
        'qwen3-asr': 'qwen-code',
    };

    private readonly logger = new Logger(OmniRouteProvider.name);
    private readonly apiKey: string;
    private readonly chatCompletionsUrl = 'https://omniroute.ngocquach.com/v1/chat/completions';
    private readonly transcriptionsUrl = 'https://omniroute.ngocquach.com/v1/audio/transcriptions';

    public constructor(private readonly configService: ConfigService) {
        const apiKey = process.env.OMNIROUTE_API_KEY;
        if (!apiKey) {
            throw new Error('OMNIROUTE_API_KEY environment variable is required');
        }
        this.apiKey = apiKey;
    }

    public async generateContent(prompt: string, userId?: string, options?: GenerateContentOptions): Promise<string> {
        void options;
        const modelName = await this.getModelName(userId);

        try {
            const response = await axios.post(
                this.chatCompletionsUrl,
                {
                    model: modelName,
                    messages: [
                        {
                            role: 'user',
                            content: prompt,
                        },
                    ],
                },
                {
                    headers: {
                        Authorization: `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json',
                    },
                },
            );

            const content = (response.data as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message?.content;

            if (!content) {
                throw new Error('No content received from OmniRoute API');
            }

            return content;
        } catch (error) {
            this.handleApiError(error, 'generateContent', modelName);
            throw error;
        }
    }

    public async transcribeAudio(audioBuffer: Buffer, mimeType: string, sourceLanguage: string, userId?: string): Promise<string> {
        const modelName = await this.getAudioModelName(userId);

        try {
            const formData = new FormData();
            formData.append('file', audioBuffer, {
                filename: `audio.${this.getFileExtension(mimeType)}`,
                contentType: mimeType,
            });
            formData.append('model', modelName);
            formData.append('language', sourceLanguage);

            const headers = formData.getHeaders() as Record<string, string>;
            const response = await axios.post<{ text?: string }>(this.transcriptionsUrl, formData, {
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    ...headers,
                },
            });

            const text = response.data?.text?.trim();
            if (!text) {
                throw new Error('No transcript received from OmniRoute API');
            }

            return text;
        } catch (error) {
            if (this.shouldRetryWithDefaultAudioModel(error, modelName)) {
                this.logger.warn(`Configured OmniRoute audio model "${modelName}" is invalid for transcription. Falling back to "${OmniRouteProvider.DEFAULT_AUDIO_MODEL}".`);
                return this.transcribeWithModel(audioBuffer, mimeType, sourceLanguage, OmniRouteProvider.DEFAULT_AUDIO_MODEL);
            }

            this.handleApiError(error, 'transcribeAudio', modelName);
            throw error;
        }
    }

    public async getModelName(userId?: string): Promise<string> {
        const configValue = await this.configService.getConfig(userId || null, 'ai.model');
        return typeof configValue === 'string' && configValue.trim().length > 0 ? configValue : OmniRouteProvider.DEFAULT_TEXT_MODEL;
    }

    public async getAudioModelName(userId?: string): Promise<string> {
        const audioModelConfig = await this.configService.getConfig(userId || null, 'ai.audio.model');
        if (typeof audioModelConfig === 'string' && audioModelConfig.trim().length > 0) {
            return this.normalizeAudioModelName(audioModelConfig);
        }

        return OmniRouteProvider.DEFAULT_AUDIO_MODEL;
    }

    private getFileExtension(mimeType: string): string {
        const mimeToExt: Record<string, string> = {
            'audio/wav': 'wav',
            'audio/x-wav': 'wav',
            'audio/wave': 'wav',
            'audio/mpeg': 'mp3',
            'audio/mp3': 'mp3',
            'audio/aiff': 'aiff',
            'audio/x-aiff': 'aiff',
            'audio/aac': 'aac',
            'audio/ogg': 'ogg',
            'audio/vorbis': 'ogg',
            'audio/flac': 'flac',
            'audio/x-flac': 'flac',
            'audio/mp4': 'm4a',
            'audio/x-m4a': 'm4a',
            'audio/webm': 'webm',
        };

        const ext = mimeToExt[mimeType.toLowerCase()];
        if (ext) {
            return ext;
        }

        this.logger.warn(`Unknown audio MIME type: ${mimeType}, defaulting to wav`);
        return 'wav';
    }

    private async transcribeWithModel(audioBuffer: Buffer, mimeType: string, sourceLanguage: string, modelName: string): Promise<string> {
        const formData = new FormData();
        formData.append('file', audioBuffer, {
            filename: `audio.${this.getFileExtension(mimeType)}`,
            contentType: mimeType,
        });
        formData.append('model', modelName);
        formData.append('language', sourceLanguage);

        const headers = formData.getHeaders() as Record<string, string>;
        const response = await axios.post<{ text?: string }>(this.transcriptionsUrl, formData, {
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                ...headers,
            },
        });

        const text = response.data?.text?.trim();
        if (!text) {
            throw new Error('No transcript received from OmniRoute API');
        }

        return text;
    }

    private normalizeAudioModelName(modelName: string): string {
        const trimmedModelName = modelName.trim();

        if (trimmedModelName.includes('/')) {
            return trimmedModelName;
        }

        if (trimmedModelName === 'general-audio-combo') {
            return OmniRouteProvider.DEFAULT_AUDIO_MODEL;
        }

        const providerName = OmniRouteProvider.AUDIO_MODEL_PROVIDER_MAP[trimmedModelName];
        if (providerName) {
            return `${providerName}/${trimmedModelName}`;
        }

        return `deepgram/${trimmedModelName}`;
    }

    private shouldRetryWithDefaultAudioModel(error: unknown, attemptedModel: string): boolean {
        if (attemptedModel === OmniRouteProvider.DEFAULT_AUDIO_MODEL || !axios.isAxiosError(error)) {
            return false;
        }

        const axiosError = error as AxiosError<{ error?: { message?: string } }>;
        const statusCode = axiosError.response?.status;
        const apiMessage = axiosError.response?.data?.error?.message;

        return statusCode === 400 && typeof apiMessage === 'string' && apiMessage.toLowerCase().includes('invalid transcription model');
    }

    private handleApiError(error: unknown, operation: string, modelName: string): void {
        if (axios.isAxiosError(error)) {
            const axiosError = error as AxiosError<{ error?: { message?: string } }>;
            const statusCode = axiosError.response?.status;
            const errorData = axiosError.response?.data;

            let errorMessage = `OmniRoute API ${operation} failed`;
            if (statusCode === 401) {
                errorMessage = 'OmniRoute API: Unauthorized. Please check your API key.';
            } else if (statusCode === 404) {
                errorMessage = `OmniRoute API: Model "${modelName}" not found or endpoint not available.`;
            } else if (statusCode === 429) {
                errorMessage = 'OmniRoute API: Rate limit exceeded. Please try again later.';
            } else if (statusCode === 400) {
                errorMessage = `OmniRoute API: Bad request. ${errorData?.error?.message || ''}`;
            } else if (statusCode) {
                errorMessage = `OmniRoute API: Request failed with status ${statusCode}. ${errorData?.error?.message || ''}`;
            }

            this.logger.error(errorMessage, {
                statusCode,
                errorData,
                model: modelName,
                operation,
            });
            return;
        }

        this.logger.error(`OmniRoute API ${operation} error:`, error);
    }
}
