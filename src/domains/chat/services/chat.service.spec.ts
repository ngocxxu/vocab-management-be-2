import { ChatService } from './chat.service';

describe('ChatService.saveAndEnqueue', () => {
    const build = () => {
        const chatMessageRepository = { create: jest.fn().mockResolvedValue({ id: 'msg-1' }) };
        const aiChatProducer = { addChatJob: jest.fn().mockResolvedValue({ jobId: 'job-1' }) };
        const redisService = { del: jest.fn().mockResolvedValue(undefined) };
        const logger = { info: jest.fn() };
        const service = new ChatService(chatMessageRepository as never, aiChatProducer as never, redisService as never, {} as never, logger as never);

        return { service, aiChatProducer };
    };

    it('passes the UI locale into the chat job', async () => {
        // Arrange
        const { service, aiChatProducer } = build();

        // Act
        await service.saveAndEnqueue('user-1', 'hi', 'MEMBER', 'vi');

        // Assert
        expect(aiChatProducer.addChatJob).toHaveBeenCalledWith({ userId: 'user-1', messageId: 'msg-1', tier: 'MEMBER', locale: 'vi' });
    });

    it('uses en for the chat job when no locale is given', async () => {
        // Arrange
        const { service, aiChatProducer } = build();

        // Act
        await service.saveAndEnqueue('user-1', 'hi', 'MEMBER');

        // Assert
        expect(aiChatProducer.addChatJob).toHaveBeenCalledWith(expect.objectContaining({ locale: 'en' }));
    });
});
