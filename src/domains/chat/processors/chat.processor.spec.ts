import { appMessage } from '@/shared/utils/app-messages.util';
import { ChatRole } from '@prisma/client';
import { ChatProcessor } from './chat.processor';

type TestLocale = 'en' | 'vi';

function buildProcessor(replyText: string) {
    const provider = { chat: jest.fn().mockResolvedValue({ type: 'text', content: replyText, tokenCount: 3 }) };
    const aiProviderFactory = { getChatProvider: jest.fn().mockResolvedValue(provider) };
    const userRepository = { findById: jest.fn().mockResolvedValue({ firstName: 'An', lastName: 'Nguyen', role: 'MEMBER' }) };
    const chatMessageRepository = {
        findLastN: jest.fn().mockResolvedValue([{ id: 'msg-1', role: ChatRole.USER, message: 'hello' }]),
        create: jest.fn().mockResolvedValue({ id: 'saved-1' }),
    };
    const redisPubSub = { publish: jest.fn().mockResolvedValue(undefined) };
    const redisService = { get: jest.fn().mockResolvedValue(null), del: jest.fn().mockResolvedValue(undefined) };
    const mcpToolRegistry = { getToolsForTier: jest.fn().mockReturnValue([]), getToolByName: jest.fn() };
    const abortRegistry = { create: jest.fn().mockReturnValue(new AbortController().signal), delete: jest.fn() };
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

    const processor = new ChatProcessor(
        redisPubSub as never,
        redisService as never,
        aiProviderFactory as never,
        userRepository as never,
        chatMessageRepository as never,
        mcpToolRegistry as never,
        abortRegistry as never,
        logger as never,
    );

    return { processor, provider, chatMessageRepository, redisPubSub };
}

function chatJob(locale?: TestLocale) {
    return { id: 'job-1', data: { userId: 'user-1', messageId: 'msg-1', tier: 'MEMBER', ...(locale ? { locale } : {}) } };
}

describe('ChatProcessor reply handling', () => {
    it('replaces a bare OUT_OF_SCOPE reply with the fixed message in the user language', async () => {
        // Arrange
        const { processor, provider, chatMessageRepository, redisPubSub } = buildProcessor('OUT_OF_SCOPE');

        // Act
        await processor.handleChatJob(chatJob('vi') as never);

        // Assert
        expect(provider.chat).toHaveBeenCalledTimes(1);
        expect(chatMessageRepository.create).toHaveBeenCalledWith('user-1', ChatRole.ASSISTANT, appMessage('outOfScope', 'vi'));
        expect(redisPubSub.publish).toHaveBeenLastCalledWith(expect.any(String), { message: appMessage('outOfScope', 'vi') });
    });

    it('treats the marker with wrapping punctuation as out of scope', async () => {
        // Arrange
        const { processor, chatMessageRepository } = buildProcessor('"OUT_OF_SCOPE."');

        // Act
        await processor.handleChatJob(chatJob() as never);

        // Assert
        expect(chatMessageRepository.create).toHaveBeenCalledWith('user-1', ChatRole.ASSISTANT, appMessage('outOfScope', 'en'));
    });

    it('saves a reply that only mentions the marker inside a sentence as normal text', async () => {
        // Arrange
        const content = 'OUT_OF_SCOPE is not something I can answer here.';
        const { processor, provider, chatMessageRepository } = buildProcessor(content);

        // Act
        await processor.handleChatJob(chatJob() as never);

        // Assert
        expect(provider.chat).toHaveBeenCalledTimes(1);
        expect(chatMessageRepository.create).toHaveBeenCalledWith('user-1', ChatRole.ASSISTANT, content, [], 3, expect.any(Number));
    });

    it('makes one AI call and saves the answer for an in-scope question', async () => {
        // Arrange
        const { processor, provider, chatMessageRepository } = buildProcessor('You have 3 folders.');

        // Act
        await processor.handleChatJob(chatJob() as never);

        // Assert
        expect(provider.chat).toHaveBeenCalledTimes(1);
        expect(chatMessageRepository.create).toHaveBeenCalledWith('user-1', ChatRole.ASSISTANT, 'You have 3 folders.', [], 3, expect.any(Number));
    });
});
