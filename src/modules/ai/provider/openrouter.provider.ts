import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { ConfigService } from '../../config/service';
import { AI_CONFIG } from '../util/const.util';
import { GenerateContentOptions, IAiProvider } from './ai-provider.interface';

@Injectable()
export class OpenRouterProvider implements IAiProvider {
    private readonly logger = new Logger(OpenRouterProvider.name);
    private readonly apiKey: string;
    private readonly baseUrl = 'https://openrouter.ai/api/v1/chat/completions';

    public constructor(private readonly configService: ConfigService) {
        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
            throw new Error('OPENROUTER_API_KEY environment variable is required');
        }
        this.apiKey = apiKey;
    }

    public async generateContent(
        prompt: string,
        userId?: string,
        options?: GenerateContentOptions,
    ): Promise<string> {
        // 1. Prepare Model & Logic common
        const modelName = await this.getModelName(userId);
        const openRouterModelName = this.mapModelNameToOpenRouter(modelName);

        // 2. Build Content Payload
        const content: Array<{
            type: 'text' | 'input_audio';
            text?: string;
            input_audio?: { data: string; format: string };
        }> = [
            {
                type: 'text',
                text: prompt,
            },
        ];

        // 3. Process Audio (Centralized Logic)
        // Only write logic to convert base64 and map format HERE
        if (options?.audioBuffer && options?.audioMimeType) {
            const audioFormat = this.mapMimeTypeToFormat(options.audioMimeType);
            content.push({
                type: 'input_audio',
                input_audio: {
                    data: options.audioBuffer.toString('base64'),
                    format: audioFormat,
                },
            });
        }

        try {
            // 4. Call API
            const response = await axios.post(
                this.baseUrl,
                {
                    model: openRouterModelName,
                    messages: [
                        {
                            role: 'user',
                            content,
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

            return (
                (response.data as { choices: { message: { content: string } }[] })?.choices?.[0]
                    ?.message?.content || ''
            );
        } catch (error) {
            // Handle error centrally (Log detailed error from Axios if needed)
            this.logger.error('OpenRouter API Error:', error);
            throw error;
        }
    }

    public async transcribeAudio(
        audioBuffer: Buffer,
        mimeType: string,
        sourceLanguage: string,
        userId?: string,
    ): Promise<string> {
        const prompt = `Transcribe this ${sourceLanguage} audio recording. Return only the transcript text, no additional commentary.`;

        const result = await this.generateContent(prompt, userId, {
            audioBuffer,
            audioMimeType: mimeType,
        });

        return result.trim();
    }

    public async getModelName(userId?: string): Promise<string> {
        const configValue = await this.configService.getConfig(userId || null, 'ai.model');
        return configValue && typeof configValue === 'string'
            ? configValue
            : AI_CONFIG.models?.[0] || '';
    }

    private mapModelNameToOpenRouter(modelName: string): string {
        if (modelName.startsWith('google/') || modelName.includes('/')) {
            return modelName;
        }
        return `google/${modelName}`;
    }

    private mapMimeTypeToFormat(mimeType: string): string {
        const mimeToFormat: Record<string, string> = {
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
            'audio/webm': 'wav',
        };

        const format = mimeToFormat[mimeType.toLowerCase()];
        if (format) {
            return format;
        }

        const extension = mimeType.split('/')[1]?.split(';')[0];
        if (extension && ['wav', 'mp3', 'aiff', 'aac', 'ogg', 'flac', 'm4a'].includes(extension)) {
            return extension;
        }

        this.logger.warn(`Unknown audio MIME type: ${mimeType}, defaulting to wav`);
        return 'wav';
    }
}
