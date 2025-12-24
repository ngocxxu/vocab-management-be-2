import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosError } from 'axios';
// eslint-disable-next-line import/no-extraneous-dependencies
import FormData from 'form-data';
import { ConfigService } from '../../config/service';
import { AI_CONFIG } from '../util/const.util';
import { GenerateContentOptions, IAiProvider } from './ai-provider.interface';

@Injectable()
export class GroqProvider implements IAiProvider {
    private readonly logger = new Logger(GroqProvider.name);
    private readonly apiKey: string;
    private readonly chatCompletionsUrl = 'https://api.groq.com/openai/v1/chat/completions';
    private readonly transcriptionsUrl = 'https://api.groq.com/openai/v1/audio/transcriptions';

    public constructor(private readonly configService: ConfigService) {
        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) {
            throw new Error('GROQ_API_KEY environment variable is required');
        }
        this.apiKey = apiKey;
    }

    public async generateContent(
        prompt: string,
        userId?: string,
        options?: GenerateContentOptions,
    ): Promise<string> {
        const hasAudio = !!(options?.audioBuffer && options?.audioMimeType);
        const modelName = hasAudio
            ? await this.getAudioModelName(userId)
            : await this.getModelName(userId);

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

            const content = (response.data as { choices: { message: { content: string } }[] })
                ?.choices?.[0]?.message?.content;

            if (!content) {
                throw new Error('No content received from Groq API');
            }

            return content;
        } catch (error) {
            this.handleApiError(error, 'generateContent', modelName);
            throw error;
        }
    }

    public async transcribeAudio(
        audioBuffer: Buffer,
        mimeType: string,
        sourceLanguage: string,
        userId?: string,
    ): Promise<string> {
        const modelName = await this.getAudioModelName(userId);

        try {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
            const formData = new FormData();
            const fileExtension = this.getFileExtension(mimeType);

            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            formData.append('file', audioBuffer, {
                filename: `audio.${fileExtension}`,
                contentType: mimeType,
            });
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            formData.append('model', modelName);
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            formData.append('language', sourceLanguage);
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            formData.append(
                'prompt',
                `Transcribe this ${sourceLanguage} audio recording. Return only the transcript text, no additional commentary.`,
            );

            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            const headers = formData.getHeaders();
            const response = await axios.post<{ text?: string }>(this.transcriptionsUrl, formData, {
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    ...(headers as Record<string, string>),
                },
            });

            const text: string | undefined = response.data?.text;

            if (!text) {
                throw new Error('No transcript received from Groq API');
            }

            return text.trim();
        } catch (error) {
            if (error instanceof Error && error.message.includes('Cannot find module')) {
                throw new Error(
                    'form-data package is required for Groq audio transcription. Please install it: npm install form-data',
                );
            }
            this.handleApiError(error, 'transcribeAudio', modelName);
            throw error;
        }
    }

    public async getModelName(userId?: string): Promise<string> {
        const configValue = await this.configService.getConfig(userId || null, 'ai.model');
        return configValue && typeof configValue === 'string'
            ? configValue
            : AI_CONFIG.models?.[0] || '';
    }

    public async getAudioModelName(userId?: string): Promise<string> {
        const audioModelConfig = await this.configService.getConfig(
            userId || null,
            'ai.audio.model',
        );
        if (audioModelConfig && typeof audioModelConfig === 'string') {
            return audioModelConfig;
        }
        return this.getModelName(userId);
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

        const extension = mimeType.split('/')[1]?.split(';')[0];
        if (
            extension &&
            ['wav', 'mp3', 'aiff', 'aac', 'ogg', 'flac', 'm4a', 'webm'].includes(extension)
        ) {
            return extension;
        }

        this.logger.warn(`Unknown audio MIME type: ${mimeType}, defaulting to wav`);
        return 'wav';
    }

    private handleApiError(error: unknown, operation: string, modelName: string): void {
        if (axios.isAxiosError(error)) {
            const axiosError = error as AxiosError<{ error?: { message?: string; type?: string } }>;
            const statusCode = axiosError.response?.status;
            const errorData = axiosError.response?.data;

            let errorMessage = `Groq API ${operation} failed`;
            if (statusCode === 401) {
                errorMessage = 'Groq API: Unauthorized. Please check your API key.';
            } else if (statusCode === 402) {
                errorMessage = 'Groq API: Payment required. Please check your account credits.';
            } else if (statusCode === 404) {
                errorMessage = `Groq API: Model "${modelName}" not found or endpoint not available.`;
            } else if (statusCode === 429) {
                errorMessage = 'Groq API: Rate limit exceeded. Please try again later.';
            } else if (statusCode === 400) {
                errorMessage = `Groq API: Bad request. ${errorData?.error?.message || ''}`;
            } else if (statusCode) {
                errorMessage = `Groq API: Request failed with status ${statusCode}. ${
                    errorData?.error?.message || ''
                }`;
            }

            this.logger.error(`${errorMessage}`, {
                statusCode,
                errorData,
                model: modelName,
                operation,
            });
        } else {
            this.logger.error(`Groq API ${operation} error:`, error);
        }
    }
}
