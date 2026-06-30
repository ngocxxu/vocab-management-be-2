import { ConfigService } from '@/domains/platform/config/services';
import { Content, GenerativeModel, GoogleGenerativeAI, Part } from '@google/generative-ai';
import { Injectable, Logger } from '@nestjs/common';
import { AI_CONFIG } from '../utils/const.util';
import { ChatHistoryMessage, ChatParams, ChatResponse, GenerateContentOptions, IAiProvider } from './ai-provider.interface';

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
    public async generateContent(prompt: string, userId?: string, options?: GenerateContentOptions): Promise<string> {
        try {
            const hasAudio = !!(options?.audioBuffer && options?.audioMimeType);
            const model = await this.getModel(userId, hasAudio);
            const requestParts: (string | { inlineData: { data: string; mimeType: string } })[] = [prompt];

            // Validate and attach audio if present
            if (hasAudio && options.audioBuffer && options.audioMimeType) {
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
    public async transcribeAudio(audioBuffer: Buffer, mimeType: string, sourceLanguage: string, userId?: string): Promise<string> {
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
        return configValue && typeof configValue === 'string' ? configValue : AI_CONFIG.models?.[0] || '';
    }

    public async getAudioModelName(userId?: string): Promise<string> {
        const audioModelConfig = await this.configService.getConfig(userId || null, 'ai.audio.model');
        if (audioModelConfig && typeof audioModelConfig === 'string') {
            return audioModelConfig;
        }
        return this.getModelName(userId);
    }

    public async chat(params: ChatParams): Promise<ChatResponse> {
        const modelName = (await this.getModelName()) || 'gemini-1.5-flash';
        const functionDeclarations = params.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters as unknown as import('@google/generative-ai').FunctionDeclarationSchema,
        }));

        const model = this.genAI.getGenerativeModel({
            model: modelName,
            systemInstruction: params.systemPrompt,
            ...(functionDeclarations.length > 0 && { tools: [{ functionDeclarations }] }),
        });

        const contents = this.buildGeminiContents(params.history);
        const result = await model.generateContent({ contents });
        const response = result.response;

        const parts = response.candidates?.[0]?.content?.parts ?? [];
        const funcCallPart = parts.find((p: Part) => p.functionCall);
        if (funcCallPart?.functionCall) {
            const fc = funcCallPart.functionCall;
            return {
                type: 'tool_call',
                name: fc.name,
                params: fc.args as unknown,
                toolCallId: `gemini-${fc.name}-${Date.now()}`,
            };
        }

        return {
            type: 'text',
            content: response.text(),
            tokenCount: response.usageMetadata?.totalTokenCount,
        };
    }

    private buildGeminiContents(history: ChatHistoryMessage[]): Content[] {
        const contents: Content[] = [];

        for (const msg of history) {
            if (msg.role === 'user') {
                contents.push({ role: 'user', parts: [{ text: msg.content }] });
            } else if (msg.role === 'assistant') {
                if (msg.toolCalls?.length) {
                    const tc = msg.toolCalls[0];
                    contents.push({
                        role: 'model',
                        parts: [{ functionCall: { name: tc.name, args: JSON.parse(tc.arguments) as Record<string, unknown> } }],
                    });
                } else {
                    contents.push({ role: 'model', parts: [{ text: msg.content }] });
                }
            } else if (msg.role === 'tool') {
                contents.push({
                    role: 'user',
                    parts: [{ functionResponse: { name: msg.toolName ?? 'unknown', response: { result: msg.content } } }],
                });
            }
        }

        return contents;
    }

    private async getModel(userId?: string, useAudioModel = false): Promise<GenerativeModel> {
        const modelName = useAudioModel ? await this.getAudioModelName(userId) : await this.getModelName(userId);
        return this.genAI.getGenerativeModel({ model: modelName });
    }
}
