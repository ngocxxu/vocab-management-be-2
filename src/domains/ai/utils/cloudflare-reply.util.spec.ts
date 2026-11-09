import { readCloudflareReply } from './cloudflare-reply.util';

describe('readCloudflareReply', () => {
    it('reads text from the response field that older models fill', () => {
        // Arrange
        const result = { response: 'hello' };

        // Act
        const reply = readCloudflareReply(result);

        // Assert
        expect(reply).toEqual({ text: 'hello', toolCalls: [] });
    });

    it('reads text from choices when the response field is absent', () => {
        // Arrange
        const result = { choices: [{ message: { content: 'OK.\n' } }] };

        // Act & Assert
        expect(readCloudflareReply(result)).toEqual({ text: 'OK.\n', toolCalls: [] });
    });

    it('prefers the response field when both shapes carry text', () => {
        // Arrange
        const result = { response: 'from response', choices: [{ message: { content: 'from choices' } }] };

        // Act & Assert
        expect(readCloudflareReply(result).text).toBe('from response');
    });

    it('falls back to choices when the response field is empty', () => {
        // Arrange
        const result = { response: '', choices: [{ message: { content: 'from choices' } }] };

        // Act & Assert
        expect(readCloudflareReply(result).text).toBe('from choices');
    });

    it('returns null text when neither shape carries text', () => {
        // Act & Assert
        expect(readCloudflareReply({ choices: [{ message: { content: null } }] }).text).toBeNull();
        expect(readCloudflareReply({}).text).toBeNull();
    });

    it('reads tool calls from the top-level field that older models fill', () => {
        // Arrange
        const result = { response: null, tool_calls: [{ name: 'lookup_word', arguments: { word: 'ghế' } }] };

        // Act & Assert
        expect(readCloudflareReply(result).toolCalls).toEqual([{ name: 'lookup_word', arguments: { word: 'ghế' } }]);
    });

    it('reads OpenAI-style tool calls from choices and parses their JSON arguments', () => {
        // Arrange
        const result = {
            choices: [
                {
                    message: {
                        content: null,
                        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'lookup_word', arguments: '{"word":"ghế"}' } }],
                    },
                },
            ],
        };

        // Act & Assert
        expect(readCloudflareReply(result).toolCalls).toEqual([{ id: 'call_1', name: 'lookup_word', arguments: { word: 'ghế' } }]);
    });

    it('ignores an empty top-level tool_calls array and reads choices', () => {
        // Arrange
        const result = { response: null, tool_calls: [], choices: [{ message: { content: 'text', tool_calls: [] } }] };

        // Act & Assert
        expect(readCloudflareReply(result)).toEqual({ text: 'text', toolCalls: [] });
    });
});
