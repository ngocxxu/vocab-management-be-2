import { AiProviderFactory } from '@/domains/ai/providers/ai-provider.factory';
import { classifyAiJobFailure } from '@/domains/ai/utils/ai-job.util';
import { LoggerService } from '@/shared';
import { Test } from '@nestjs/testing';
import { AiFillInBlankGradingService } from './ai-fill-in-blank-grading.service';
import { AiLanguageNameService } from './ai-language-name.service';

// Built through Nest DI, so the spec does not depend on the order of the constructor arguments.
class FakeGeminiProvider {
    public generateContent = jest.fn();
    public getModelName = jest.fn().mockResolvedValue('test-model');
}

const replyWith = (items: unknown[]): string => JSON.stringify({ items });

// A sentence-length Korean answer: not an exact-match case, so it goes to the AI.
const koreanItem = (userAnswer: string) => ({
    vocab: {
        textSource: 'không muốn tài nguyên bị đầu tư quá đà',
        sourceLanguageCode: 'vi',
        targetLanguageCode: 'ko',
        textTargets: [{ textTarget: '과다하게 투자되는 걸 원하지 않다' }],
    } as never,
    userAnswer,
    systemAnswer: 'không muốn tài nguyên bị đầu tư quá đà',
    questionType: 'textSource' as const,
});

/** Resolves with the rejection reason, or undefined when the promise resolves. */
const failureOf = async (promise: Promise<unknown>): Promise<unknown> => {
    try {
        await promise;
        return undefined;
    } catch (error: unknown) {
        return error;
    }
};

describe('AiFillInBlankGradingService reply handling (#18)', () => {
    let provider: FakeGeminiProvider;
    let logger: { info: jest.Mock; warn: jest.Mock; error: jest.Mock; debug: jest.Mock };
    let service: AiFillInBlankGradingService;

    beforeEach(async () => {
        provider = new FakeGeminiProvider();
        logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

        const moduleRef = await Test.createTestingModule({
            providers: [
                AiFillInBlankGradingService,
                { provide: LoggerService, useValue: logger },
                { provide: AiProviderFactory, useValue: { getProvider: jest.fn().mockResolvedValue(provider) } },
                { provide: AiLanguageNameService, useValue: { getLanguageName: jest.fn().mockResolvedValue('Korean') } },
            ],
        }).compile();

        service = moduleRef.get(AiFillInBlankGradingService);
    });

    it('returns one grade per submitted answer when the reply has every item', async () => {
        // Arrange
        provider.generateContent.mockResolvedValue(
            replyWith([
                { answerIndex: 0, difference: 'none', isCorrect: true, explanation: 'Good.' },
                { answerIndex: 1, difference: 'wrong_word', isCorrect: false, explanation: 'Not that word.' },
            ]),
        );

        // Act
        const results = await service.evaluateAllFillInBlankAnswers([koreanItem('a'), koreanItem('b')]);

        // Assert
        expect(results).toEqual([
            { isCorrect: true, explanation: 'Good.' },
            { isCorrect: false, explanation: 'Not that word.' },
        ]);
    });

    it('fails the attempt with a retryable error when a submitted answer has no result, and logs no success line', async () => {
        // Arrange: two answers were sent, the reply has only the first
        provider.generateContent.mockResolvedValue(replyWith([{ answerIndex: 0, difference: 'none', isCorrect: true, explanation: 'Good.' }]));

        // Act
        const failure = await failureOf(service.evaluateAllFillInBlankAnswers([koreanItem('a'), koreanItem('b')]));

        // Assert
        expect(failure).toHaveProperty('name', 'AiIncompleteResponseError');
        expect(classifyAiJobFailure({ attemptsMade: 0, opts: { attempts: 3 } }, failure).permanent).toBe(false);
        expect(logger.info).not.toHaveBeenCalled();
    });

    it('takes the first item for a repeated answer and ignores extra or out-of-range items', async () => {
        // Arrange
        provider.generateContent.mockResolvedValue(
            replyWith([
                { answerIndex: 0, difference: 'none', isCorrect: true, explanation: 'First.' },
                { answerIndex: 0, difference: 'wrong_word', isCorrect: false, explanation: 'Second.' },
                { answerIndex: 1, difference: 'none', isCorrect: true, explanation: 'Second answer.' },
                { answerIndex: 7, difference: 'none', isCorrect: true, explanation: 'Extra.' },
            ]),
        );

        // Act
        const results = await service.evaluateAllFillInBlankAnswers([koreanItem('a'), koreanItem('b')]);

        // Assert
        expect(results).toEqual([
            { isCorrect: true, explanation: 'First.' },
            { isCorrect: true, explanation: 'Second answer.' },
        ]);
    });

    it('logs one diagnostics line per successful AI call: provider, model, blanks sent, prompt length, elapsed ms, attempt and job id', async () => {
        // Arrange
        provider.generateContent.mockResolvedValue(
            replyWith([
                { answerIndex: 0, difference: 'none', isCorrect: true, explanation: 'Good.' },
                { answerIndex: 1, difference: 'none', isCorrect: true, explanation: 'Good.' },
            ]),
        );

        // Act
        await service.evaluateAllFillInBlankAnswers([koreanItem('a'), koreanItem('b')], 'u1', 'en', { jobId: 'job-42', attempt: 2 });

        // Assert
        expect(logger.info).toHaveBeenCalledTimes(1);
        expect(logger.info).toHaveBeenCalledWith(
            expect.stringMatching(/^Fill-in-blank AI call ok: jobId=job-42 attempt=2 provider=FakeGeminiProvider model=test-model blanks=2 promptChars=\d+ elapsedMs=\d+$/),
        );
    });

    it('never logs answer text or the prompt', async () => {
        // Arrange
        provider.generateContent.mockResolvedValue(replyWith([{ answerIndex: 0, difference: 'none', isCorrect: true, explanation: 'Good.' }]));

        // Act
        await service.evaluateAllFillInBlankAnswers([koreanItem('SECRET-ANSWER-TEXT')], 'u1', 'en', { jobId: 'job-42', attempt: 1 });

        // Assert
        const logged = JSON.stringify([logger.info.mock.calls, logger.warn.mock.calls, logger.error.mock.calls, logger.debug.mock.calls]);
        expect(logged).not.toContain('SECRET-ANSWER-TEXT');
        expect(logged).not.toContain('Source language');
    });

    it('still returns the grades when the model name cannot be read, and logs model=unknown', async () => {
        // Arrange
        provider.generateContent.mockResolvedValue(replyWith([{ answerIndex: 0, difference: 'none', isCorrect: true, explanation: 'Good.' }]));
        provider.getModelName.mockRejectedValue(new Error('config unavailable'));

        // Act
        const results = await service.evaluateAllFillInBlankAnswers([koreanItem('a')], 'u1', 'en', { jobId: 'job-42', attempt: 1 });

        // Assert
        expect(results).toEqual([{ isCorrect: true, explanation: 'Good.' }]);
        expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('model=unknown'));
    });

    it('rethrows a provider error unchanged, so the processor can classify it', async () => {
        // Arrange
        const providerError = new Error('[429 Too Many Requests] quota');
        provider.generateContent.mockRejectedValue(providerError);

        // Act & Assert
        await expect(service.evaluateAllFillInBlankAnswers([koreanItem('a')])).rejects.toBe(providerError);
        expect(logger.info).not.toHaveBeenCalled();
    });
});
