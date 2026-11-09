import type { ConfigService } from '@/domains/platform/config/services';
import axios from 'axios';
import { GeminiProvider } from './gemini.provider';
import { GroqProvider } from './groq.provider';
import { OmniRouteProvider } from './omniroute.provider';
import { OpenRouterProvider } from './openrouter.provider';

jest.mock('axios');
jest.mock('@google/generative-ai', () => ({
    GoogleGenerativeAI: jest.fn().mockImplementation(() => ({ getGenerativeModel: mockGetGenerativeModel })),
}));

const mockGetGenerativeModel = jest.fn();
const postMock = (axios as unknown as { post: jest.Mock }).post;
const configService = { getConfig: jest.fn().mockResolvedValue('test-model') } as unknown as ConfigService;

const lastRequestBody = (): Record<string, unknown> => postMock.mock.calls[0][1] as Record<string, unknown>;

describe('JSON mode request bodies', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        process.env.GROQ_API_KEY = 'test-key';
        process.env.OMNIROUTE_API_KEY = 'test-key';
        process.env.OPENROUTER_API_KEY = 'test-key';
        process.env.GEMINI_API_KEY = 'test-key';
        postMock.mockResolvedValue({ data: { choices: [{ message: { content: '{"items":[]}' } }] } });
    });

    describe('Groq', () => {
        it('asks for a JSON object when json is set', async () => {
            // Act
            await new GroqProvider(configService).generateContent('prompt', 'user-1', { json: true });

            // Assert
            expect(lastRequestBody()).toMatchObject({ response_format: { type: 'json_object' } });
        });

        it('sends no response_format when json is not set', async () => {
            // Act
            await new GroqProvider(configService).generateContent('prompt', 'user-1');

            // Assert
            expect(lastRequestBody()).not.toHaveProperty('response_format');
        });
    });

    describe('OmniRoute', () => {
        it('asks for a JSON object when json is set', async () => {
            // Act
            await new OmniRouteProvider(configService).generateContent('prompt', 'user-1', { json: true });

            // Assert
            expect(lastRequestBody()).toMatchObject({ response_format: { type: 'json_object' } });
        });

        it('sends no response_format when json is not set', async () => {
            // Act
            await new OmniRouteProvider(configService).generateContent('prompt', 'user-1');

            // Assert
            expect(lastRequestBody()).not.toHaveProperty('response_format');
        });
    });

    describe('OpenRouter', () => {
        it('asks for a JSON object for a text request', async () => {
            // Act
            await new OpenRouterProvider(configService).generateContent('prompt', 'user-1', { json: true });

            // Assert
            expect(lastRequestBody()).toMatchObject({ response_format: { type: 'json_object' } });
        });

        it('leaves JSON mode off for an audio request', async () => {
            // Act
            await new OpenRouterProvider(configService).generateContent('prompt', 'user-1', {
                json: true,
                audioBuffer: Buffer.from('audio'),
                audioMimeType: 'audio/wav',
            });

            // Assert
            expect(lastRequestBody()).not.toHaveProperty('response_format');
        });
    });

    describe('Gemini', () => {
        beforeEach(() => {
            mockGetGenerativeModel.mockReturnValue({ generateContent: jest.fn().mockResolvedValue({ response: { text: () => '{}' } }) });
        });

        it('asks for an application/json reply when json is set', async () => {
            // Act
            await new GeminiProvider(configService).generateContent('prompt', 'user-1', { json: true });

            // Assert
            expect(mockGetGenerativeModel).toHaveBeenCalledWith(expect.objectContaining({ generationConfig: { responseMimeType: 'application/json' } }));
        });

        it('leaves JSON mode off for an audio request', async () => {
            // Act
            await new GeminiProvider(configService).generateContent('prompt', 'user-1', {
                json: true,
                audioBuffer: Buffer.from('audio'),
                audioMimeType: 'audio/wav',
            });

            // Assert
            expect(mockGetGenerativeModel.mock.calls[0][0]).not.toHaveProperty('generationConfig');
        });
    });
});
