import { StaleAiJobError } from '../utils/ai-job.util';
import { FillInBlankEvaluationProcessor } from './fill-in-blank-evaluation.processor';

describe('FillInBlankEvaluationProcessor failure lifecycle', () => {
    const jobData = {
        vocabTrainerId: 't1',
        evaluations: [{ vocab: {}, userAnswer: 'a', systemAnswer: 'b', questionType: 'textSource', vocabId: 'v1' }],
        answerSubmissions: [{}],
        userId: 'u1',
        lockToken: 'tok',
    };

    const build = (opts: { owns?: boolean; aiError?: Error }) => {
        const gateway = { emitFillInBlankEvaluationProgress: jest.fn() };
        const lock = { isOwner: jest.fn().mockResolvedValue(opts.owns ?? true), refreshLock: jest.fn(), releaseIfOwned: jest.fn() };
        const aiService = { evaluateAllFillInBlankAnswers: jest.fn().mockRejectedValue(opts.aiError ?? new Error('provider down')) };
        const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
        const unused = {} as never;
        const processor = new FillInBlankEvaluationProcessor(logger as never, aiService as never, lock as never, gateway as never, unused, unused, unused, unused, unused);
        const job = (attemptsMade: number) => ({ id: 'j1', data: jobData, attemptsMade, opts: { attempts: 3 }, discard: jest.fn() });

        return { processor, gateway, lock, job };
    };

    test('a stale job tells the client it failed, discards itself and does not touch the newer lock owner', async () => {
        // Arrange
        const { processor, gateway, job } = build({ owns: false });
        const stale = job(0);

        // Act
        await expect(processor.processFillInBlankEvaluation(stale as never)).rejects.toBeInstanceOf(StaleAiJobError);

        // Assert
        expect(gateway.emitFillInBlankEvaluationProgress).toHaveBeenCalledWith('u1', 'j1', 'failed', expect.objectContaining({ error: expect.any(String) }));
        expect(stale.discard).toHaveBeenCalledTimes(1);
    });

    test('a failed attempt that will be retried keeps the client waiting and holds the lock', async () => {
        // Arrange
        const { processor, gateway, lock, job } = build({});
        const first = job(0);

        // Act
        await expect(processor.processFillInBlankEvaluation(first as never)).rejects.toThrow('provider down');

        // Assert
        expect(gateway.emitFillInBlankEvaluationProgress).not.toHaveBeenCalledWith('u1', 'j1', 'failed', expect.anything());
        expect(gateway.emitFillInBlankEvaluationProgress).toHaveBeenLastCalledWith('u1', 'j1', 'evaluating');
        expect(lock.releaseIfOwned).not.toHaveBeenCalled();
        expect(first.discard).not.toHaveBeenCalled();
    });

    test('the final attempt reports failure and releases the lock', async () => {
        // Arrange
        const { processor, gateway, lock, job } = build({});

        // Act
        await expect(processor.processFillInBlankEvaluation(job(2) as never)).rejects.toThrow('provider down');

        // Assert
        expect(gateway.emitFillInBlankEvaluationProgress).toHaveBeenLastCalledWith('u1', 'j1', 'failed', { error: 'provider down' });
        expect(lock.releaseIfOwned).toHaveBeenCalledWith('u1', 'tok');
    });

    test('a rate limit fails immediately without a retry', async () => {
        // Arrange
        const { processor, gateway, job } = build({ aiError: new Error('[429 Too Many Requests] quota') });
        const first = job(0);

        // Act
        await expect(processor.processFillInBlankEvaluation(first as never)).rejects.toThrow('429');

        // Assert
        expect(first.discard).toHaveBeenCalledTimes(1);
        expect(gateway.emitFillInBlankEvaluationProgress).toHaveBeenLastCalledWith('u1', 'j1', 'failed', expect.anything());
    });
});
