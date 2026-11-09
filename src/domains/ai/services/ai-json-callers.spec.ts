import { AiTranslationEvaluationService } from './ai-translation-evaluation.service';
import { AiService } from './ai.service';

describe('AI callers ask the provider for JSON mode', () => {
    const languageNameService = { getLanguageName: jest.fn().mockResolvedValue('Vietnamese') };

    it('translation evaluation sends json: true', async () => {
        // Arrange
        const reply = { scores: { accuracy: 8, fluency: 7, register: 9, completeness: 8 }, errors: [], missingIdeas: [], correctedTranslation: 'x', advice: [] };
        const generateContent = jest.fn().mockResolvedValue(JSON.stringify(reply));
        const providerFactory = { getProvider: jest.fn().mockResolvedValue({ generateContent }) };
        const service = new AiTranslationEvaluationService(providerFactory as never, languageNameService as never);

        // Act
        await service.evaluateTranslation({
            targetDialogue: [{ speaker: 'A', text: 'hi' }],
            transcript: 'chào',
            sourceLanguageCode: 'vi',
            targetLanguageCode: 'en',
            sourceWords: ['chào'],
        });

        // Assert
        expect(generateContent).toHaveBeenCalledWith(expect.any(String), undefined, { json: true });
    });

    it('dialogue generation sends json: true', async () => {
        // Arrange
        const generateContent = jest.fn().mockResolvedValue(JSON.stringify({ dialogue: [] }));
        const providerFactory = { getProvider: jest.fn().mockResolvedValue({ generateContent }) };
        const unused = {} as never;
        const service = new AiService(providerFactory as never, unused, unused, unused, unused, unused, unused, unused, languageNameService as never);

        // Act
        await service.generateDialogueForVocabs(['xin chào'], ['hello'], 'vi', 'en');

        // Assert
        expect(generateContent).toHaveBeenCalledWith(expect.any(String), undefined, { json: true });
    });
});
