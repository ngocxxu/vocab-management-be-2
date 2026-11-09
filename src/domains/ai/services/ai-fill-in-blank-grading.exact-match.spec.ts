import { AiFillInBlankGradingService } from './ai-fill-in-blank-grading.service';

describe('AiFillInBlankGradingService exact match (th/ko)', () => {
    const generateContent = jest.fn();
    const providerFactory = { getProvider: jest.fn().mockResolvedValue({ generateContent }) };
    const languageNameService = { getLanguageName: jest.fn().mockResolvedValue('Thai') };

    let service: AiFillInBlankGradingService;

    beforeEach(() => {
        jest.clearAllMocks();
        providerFactory.getProvider.mockResolvedValue({ generateContent });
        service = new AiFillInBlankGradingService(providerFactory as never, languageNameService as never);
    });

    const thaiVocab = (textTarget: string) => ({
        textSource: 'bốn',
        sourceLanguageCode: 'vi',
        targetLanguageCode: 'th',
        textTargets: [{ textTarget }],
    });

    it('marks a one-word Thai answer with a wrong character as incorrect without calling the AI', async () => {
        // Arrange
        const evaluations = [{ vocab: thaiVocab('ตัวเลข') as never, userAnswer: 'ตัวเลก', systemAnswer: 'bốn', questionType: 'textSource' as const }];

        // Act
        const results = await service.evaluateAllFillInBlankAnswers(evaluations);

        // Assert
        expect(results).toEqual([{ isCorrect: false }]);
        expect(generateContent).not.toHaveBeenCalled();
    });

    it('marks the exact one-word Thai answer as correct without calling the AI', async () => {
        // Arrange
        const evaluations = [{ vocab: thaiVocab('ตัวเลข') as never, userAnswer: 'ตัวเลข', systemAnswer: 'bốn', questionType: 'textSource' as const }];

        // Act
        const results = await service.evaluateAllFillInBlankAnswers(evaluations);

        // Assert
        expect(results).toEqual([{ isCorrect: true, explanation: 'Correct.' }]);
        expect(generateContent).not.toHaveBeenCalled();
    });
});
