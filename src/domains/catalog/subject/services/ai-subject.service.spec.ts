import { AiSubjectService } from './ai-subject.service';

describe('AiSubjectService', () => {
    const build = (reply: string) => {
        const generateContent = jest.fn().mockResolvedValue(reply);
        const providerFactory = { getProvider: jest.fn().mockResolvedValue({ generateContent }) };

        return { service: new AiSubjectService(providerFactory as never), generateContent };
    };

    it('asks the provider for JSON mode and returns the suggested subjects', async () => {
        // Arrange
        const { service, generateContent } = build('{"items":["Animals","Food","Home","Travel","Work"]}');

        // Act
        const subjects = await service.suggestSubjects('cat', 'en');

        // Assert
        expect(generateContent).toHaveBeenCalledWith(expect.any(String), undefined, { json: true });
        expect(subjects).toHaveLength(5);
    });

    it('accepts a bare array reply', async () => {
        // Arrange
        const { service } = build('["Animals","Food"]');

        // Act & Assert
        await expect(service.suggestSubjects('cat', 'en')).resolves.toHaveLength(2);
    });

    it('returns no subjects when the reply has no list', async () => {
        // Arrange
        const { service } = build('{"result":"x"}');

        // Act & Assert
        await expect(service.suggestSubjects('cat', 'en')).resolves.toEqual([]);
    });
});
