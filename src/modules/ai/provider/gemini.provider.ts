import { GenerativeModel, GoogleGenerativeAI } from '@google/generative-ai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '../../config/service';
import { AI_CONFIG } from '../util/const.util';
import { GenerateContentOptions, IAiProvider } from './ai-provider.interface';

@Injectable()
export class GeminiProvider implements IAiProvider {
    private readonly logger = new Logger(GeminiProvider.name);
    private readonly genAI: GoogleGenerativeAI;

    public constructor(private readonly configService: ConfigService) {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error('GEMINI_API_KEY environment variable is required');
        }
        this.genAI = new GoogleGenerativeAI(apiKey);
    }

    /**
     * Core function to handle interaction with the AI Model.
     * Supports both text-only and multimodal (audio + text) requests.
     */
    public async generateContent(
        prompt: string,
        userId?: string,
        options?: GenerateContentOptions,
    ): Promise<string> {
        try {
            const model = await this.getModel(userId);
            const requestParts: (string | { inlineData: { data: string; mimeType: string } })[] = [
                prompt,
            ];

            // Validate and attach audio if present
            if (options?.audioBuffer && options?.audioMimeType) {
                const audioPart = {
                    inlineData: {
                        data: options.audioBuffer.toString('base64'),
                        mimeType: options.audioMimeType,
                    },
                };
                requestParts.push(audioPart);
            }

            // Execute request (SDK usually handles single string or array of parts)
            const result = await model.generateContent(requestParts);

            if (!result.response) {
                throw new Error('No response received from model');
            }

            return result.response.text();
        } catch (error) {
            // Centralized error handling/logging could go here
            this.logger.error('Error generating content:', error);
            throw error;
        }
    }

    /**
     * Wrapper function specifically for Audio Transcription.
     * Reuses generateContent to avoid logic duplication.
     */
    public async transcribeAudio(
        audioBuffer: Buffer,
        mimeType: string,
        sourceLanguage: string,
        userId?: string,
    ): Promise<string> {
        // Construct a specific prompt for transcription
        const prompt = `Transcribe this ${sourceLanguage} audio recording. Return only the transcript text, no additional commentary.`;

        // Reuse the core function
        const text = await this.generateContent(prompt, userId, {
            audioBuffer,
            audioMimeType: mimeType,
        });

        return text.trim();
    }

    public async getModelName(userId?: string): Promise<string> {
        const configValue = await this.configService.getConfig(userId || null, 'ai.model');
        return configValue && typeof configValue === 'string'
            ? configValue
            : AI_CONFIG.models?.[0] || '';
    }

    private async getModel(userId?: string): Promise<GenerativeModel> {
        const modelName = await this.getModelName(userId);
        return this.genAI.getGenerativeModel({ model: modelName });
    }
}
