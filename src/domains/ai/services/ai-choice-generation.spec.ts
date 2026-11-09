import { AiGenerationException } from '../exceptions';
import { AiFillInBlankChoiceService } from './ai-fill-in-blank-choice.service';
import { AiMultipleChoiceService } from './ai-multiple-choice.service';

const vocabList = [{ textSource: 'ghế', sourceLanguageCode: 'vi', targetLanguageCode: 'en', textTargets: [{ textTarget: 'chair' }] }] as never;

const validItem = {
    vocabIndex: 0,
    content: 'Please sit on the ___.',
    options: [
        { label: 'chair', value: 'chair' },
        { label: 'table', value: 'table' },
    ],
    correctAnswer: 'chair',
};

const wrongItem = { ...validItem, correctAnswer: 'lamp' };

function buildDependencies(replyText: string) {
    const generateContent = jest.fn().mockResolvedValue(replyText);
    const providerFactory = { getProvider: jest.fn().mockResolvedValue({ generateContent }) };
    const languageNameService = { getLanguageName: jest.fn().mockResolvedValue('English') };
    const logger = { warn: jest.fn(), info: jest.fn(), error: jest.fn() };

    return { generateContent, providerFactory, languageNameService, logger };
}

describe('AiFillInBlankChoiceService', () => {
    it('asks the provider for a JSON reply', async () => {
        // Arrange
        const { generateContent, providerFactory, languageNameService, logger } = buildDependencies(JSON.stringify({ items: [validItem] }));
        const service = new AiFillInBlankChoiceService(providerFactory as never, languageNameService as never, logger as never);

        // Act
        await service.generateFillInBlankChoiceQuestions(vocabList);

        // Assert
        expect(generateContent).toHaveBeenCalledWith(expect.any(String), undefined, { json: true });
    });

    it('keeps the usable question and logs the dropped one through the injected logger', async () => {
        // Arrange
        const { providerFactory, languageNameService, logger } = buildDependencies(JSON.stringify({ items: [validItem, wrongItem] }));
        const service = new AiFillInBlankChoiceService(providerFactory as never, languageNameService as never, logger as never);

        // Act
        const questions = await service.generateFillInBlankChoiceQuestions(vocabList);

        // Assert
        expect(questions).toHaveLength(1);
        expect(logger.warn).toHaveBeenCalledTimes(1);
    });

    it('fails with an error instead of returning an empty exam when no question is usable', async () => {
        // Arrange
        const { providerFactory, languageNameService, logger } = buildDependencies(JSON.stringify({ items: [wrongItem] }));
        const service = new AiFillInBlankChoiceService(providerFactory as never, languageNameService as never, logger as never);

        // Act & Assert
        await expect(service.generateFillInBlankChoiceQuestions(vocabList)).rejects.toBeInstanceOf(AiGenerationException);
    });
});

describe('AiMultipleChoiceService', () => {
    it('asks the provider for a JSON reply', async () => {
        // Arrange
        const { generateContent, providerFactory, languageNameService, logger } = buildDependencies(JSON.stringify({ items: [{ ...validItem, type: 'textTarget' }] }));
        const service = new AiMultipleChoiceService(providerFactory as never, languageNameService as never, logger as never);

        // Act
        await service.generateMultipleChoiceQuestions(vocabList);

        // Assert
        expect(generateContent).toHaveBeenCalledWith(expect.any(String), undefined, { json: true });
    });

    it('fails with an error instead of returning an empty exam when no question is usable', async () => {
        // Arrange
        const { providerFactory, languageNameService, logger } = buildDependencies(JSON.stringify({ items: [{ ...wrongItem, type: 'textTarget' }] }));
        const service = new AiMultipleChoiceService(providerFactory as never, languageNameService as never, logger as never);

        // Act & Assert
        await expect(service.generateMultipleChoiceQuestions(vocabList)).rejects.toBeInstanceOf(AiGenerationException);
    });
});
