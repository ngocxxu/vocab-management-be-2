import type { ChatParams } from './ai-provider.interface';
import type { ConfigService } from '@/domains/platform/config/services';
import axios from 'axios';
import { CloudflareProvider } from './cloudflare.provider';

jest.mock('axios');

const SEA_LION_MODEL = '@cf/aisingapore/gemma-sea-lion-v4-27b-it';
const postMock = (axios as unknown as { post: jest.Mock }).post;

// Captured from the live /ai/run endpoint: this model fills only `choices`, never `response`.
const SEA_LION_RESULT = {
    choices: [{ message: { role: 'assistant', content: '[{"answerIndex": 0}]\n', tool_calls: [] }, finish_reason: 'stop' }],
};

// Captured from the default tier model: it fills both `response` and `choices`.
const QWEN_RESULT = {
    response: '[{"answerIndex": 0}]',
    choices: [{ message: { role: 'assistant', content: '\n\n[{"answerIndex": 0}]' }, finish_reason: 'stop' }],
    tool_calls: [],
};

const CHAT_PARAMS: ChatParams = { systemPrompt: 'You are a tutor.', history: [], tools: [] };

function mockCloudflareResult(result: Record<string, unknown>): void {
    postMock.mockResolvedValue({ data: { result, success: true, errors: [], messages: [] } });
}

describe('CloudflareProvider', () => {
    let provider: CloudflareProvider;
    const configService = { getConfig: jest.fn().mockResolvedValue(SEA_LION_MODEL) };

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.CLOUDFLARE_AI_API_KEY = 'test-key';
        process.env.CLOUDFLARE_ACCOUNT_ID = 'test-account';
        provider = new CloudflareProvider(configService as unknown as ConfigService);
    });

    describe('generateContent', () => {
        it('reads the text from choices when the reply has no response field', async () => {
            // Arrange
            mockCloudflareResult(SEA_LION_RESULT);

            // Act
            const text = await provider.generateContent('Grade these answers', 'user-1');

            // Assert
            expect(text).toBe('[{"answerIndex": 0}]\n');
        });

        it('keeps reading the response field when the model fills it', async () => {
            // Arrange
            mockCloudflareResult(QWEN_RESULT);

            // Act
            const text = await provider.generateContent('Grade these answers', 'user-1');

            // Assert
            expect(text).toBe('[{"answerIndex": 0}]');
        });

        it('returns an empty string when the reply carries no text', async () => {
            // Arrange
            mockCloudflareResult({ choices: [{ message: { role: 'assistant', content: null } }] });

            // Act & Assert
            await expect(provider.generateContent('Grade these answers')).resolves.toBe('');
        });
    });

    describe('chat', () => {
        it('returns the text from choices when the reply has no response field', async () => {
            // Arrange
            mockCloudflareResult(SEA_LION_RESULT);

            // Act & Assert
            await expect(provider.chat(CHAT_PARAMS)).resolves.toEqual({ type: 'text', content: '[{"answerIndex": 0}]\n' });
        });

        it('returns a tool call found in choices with its id and parsed arguments', async () => {
            // Arrange
            mockCloudflareResult({
                choices: [
                    {
                        message: {
                            role: 'assistant',
                            content: null,
                            tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'lookup_word', arguments: '{"word":"ghế"}' } }],
                        },
                        finish_reason: 'tool_calls',
                    },
                ],
            });

            // Act & Assert
            await expect(provider.chat(CHAT_PARAMS)).resolves.toEqual({
                type: 'tool_call',
                name: 'lookup_word',
                params: { word: 'ghế' },
                toolCallId: 'call_1',
            });
        });
    });
});
