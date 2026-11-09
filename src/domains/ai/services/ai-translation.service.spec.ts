import { AiTranslationService } from './ai-translation.service';

describe('AiTranslationService.translateVocab', () => {
    const wordTypes = [{ id: 'wt-noun', name: 'noun', description: 'a naming word' }];

    const build = (reply: Record<string, unknown>) => {
        const generateContent = jest.fn().mockResolvedValue(JSON.stringify(reply));
        const providerFactory = { getProvider: jest.fn().mockResolvedValue({ generateContent }) };
        const wordTypeRepository = { findAll: jest.fn().mockResolvedValue(wordTypes) };
        const service = new AiTranslationService(providerFactory as never, wordTypeRepository as never);

        return { service, generateContent };
    };

    const baseReply = { textTarget: 'chair', wordTypeId: 'wt-noun', explanationSource: 'a seat', explanationTarget: 'ghế', vocabExamples: [] };
    const request = { textSource: 'ghế', sourceLanguageCode: 'vi', targetLanguageCode: 'en' };

    it('asks the provider for a JSON reply', async () => {
        // Arrange
        const { service, generateContent } = build(baseReply);

        // Act
        await service.translateVocab(request);

        // Assert
        expect(generateContent).toHaveBeenCalledWith(expect.any(String), undefined, { json: true });
    });

    it('keeps a word type id that is in the authorized list', async () => {
        // Arrange
        const { service } = build(baseReply);

        // Act
        const result = await service.translateVocab(request);

        // Assert
        expect(result.wordTypeId).toBe('wt-noun');
    });

    it('drops a word type id that the model invented', async () => {
        // Arrange
        const { service } = build({ ...baseReply, wordTypeId: 'wt-made-up' });

        // Act
        const result = await service.translateVocab(request);

        // Assert
        expect(result.wordTypeId).toBeUndefined();
    });

    it('asks for explanations in Vietnamese when the locale is vi', async () => {
        // Arrange
        const { service, generateContent } = build(baseReply);

        // Act
        await service.translateVocab({ ...request, locale: 'vi' });

        // Assert
        expect(String(generateContent.mock.calls[0][0])).toContain('written in Vietnamese');
    });
});
