import { BaseRepository } from '@/database/base.repository';
import { Prisma } from '@prisma/client';
import { StaleAiJobError } from '../utils/ai-job.util';
import { FillInBlankEvaluationProcessor } from './fill-in-blank-evaluation.processor';

// The real retry loop of BaseRepository. The mocked repositories below run it on top of their mocked inTransaction.
type MockTransactions = { inTransaction: (work: (tx: object) => Promise<unknown>) => Promise<unknown> };

/** BaseRepository with its own retry loop. Its transaction is the mocked inTransaction of the caller. */
class RetryHarness extends BaseRepository {
    public constructor(private readonly transactions: MockTransactions) {
        super({} as never);
    }

    public override async inTransaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
        const result = await this.transactions.inTransaction(work as (tx: object) => Promise<unknown>);
        return result as T;
    }
}

const retryOn = async (transactions: MockTransactions, work: (tx: object) => Promise<unknown>): Promise<unknown> => {
    const result = await new RetryHarness(transactions).runSerializableWithRetry(work);
    return result;
};
const writeConflict = () => new Prisma.PrismaClientKnownRequestError('Transaction failed due to a write conflict or a deadlock.', { code: 'P2034', clientVersion: '6.11.1' });

const SUBMITTED_AT = '2026-11-23T10:00:00.000Z';

const jobData = {
    vocabTrainerId: 't1',
    evaluations: [{ vocab: {}, userAnswer: 'a', systemAnswer: 'b', questionType: 'textSource', vocabId: 'v1' }],
    answerSubmissions: [{}],
    userId: 'u1',
    lockToken: 'tok',
    countsAsAttempt: true,
    submittedAt: SUBMITTED_AT,
};
const baseTrainer = {
    id: 't1',
    name: 'Week 1',
    userId: 'u1',
    lastExamSubmittedAt: null,
    reminderRepeat: 1,
    reminderMaxRepeat: 6,
    reminderDisabled: false,
    countTime: 0,
    questionType: 'FILL_IN_THE_BLANK',
};

describe('FillInBlankEvaluationProcessor failure lifecycle', () => {
    const build = (opts: { owns?: boolean; aiError?: Error; trainer?: Record<string, unknown> | null; lockedTrainer?: Record<string, unknown> | null }) => {
        const gateway = { emitFillInBlankEvaluationProgress: jest.fn() };
        const lock = { isOwner: jest.fn().mockResolvedValue(opts.owns ?? true), refreshLock: jest.fn(), releaseIfOwned: jest.fn() };
        const aiService = { evaluateAllFillInBlankAnswers: jest.fn().mockRejectedValue(opts.aiError ?? new Error('provider down')) };
        const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
        const trainerRepository = {
            findVocabTrainerByIdMinimal: jest.fn().mockResolvedValue(opts.trainer === undefined ? baseTrainer : opts.trainer),
            lockAndFindForUpdate: jest.fn().mockResolvedValue(opts.lockedTrainer === undefined ? baseTrainer : opts.lockedTrainer),
            inTransaction: jest.fn(async (fn: (tx: object) => Promise<unknown>) => {
                const result = await fn({});
                return result;
            }),
            runSerializableWithRetry: jest.fn(async (fn: (tx: object) => Promise<unknown>) => {
                const result = await retryOn(trainerRepository, fn);
                return result;
            }),
            deleteVocabTrainerResults: jest.fn().mockResolvedValue(undefined),
            createVocabTrainerResultsMany: jest.fn().mockResolvedValue(undefined),
            findResultsByTrainerId: jest.fn().mockResolvedValue([]),
        };
        const attempt = {
            applyAttemptTx: jest.fn((_tx: unknown, input: { counts: boolean }) => ({
                counts: input.counts,
                passed: true,
                completed: false,
                trainerId: 't1',
                userId: 'u1',
                trainerName: 'x',
                maxRepeat: 6,
                passes: 1,
                trainer: baseTrainer,
            })),
            afterCommit: jest.fn().mockResolvedValue(undefined),
        };
        const userRepository = { findById: jest.fn().mockResolvedValue({ id: 'u1', email: 'a@example.com', firstName: 'A', lastName: 'B' }) };
        const mastery = { updateMastery: jest.fn().mockResolvedValue(undefined) };
        const processor = new FillInBlankEvaluationProcessor(
            logger as never,
            aiService as never,
            lock as never,
            gateway as never,
            trainerRepository as never,
            userRepository as never,
            mastery as never,
            attempt as never,
        );
        const job = (attemptsMade: number) => ({ id: 'j1', data: jobData, attemptsMade, opts: { attempts: 3 }, discard: jest.fn() });

        return { processor, gateway, lock, job, trainerRepository, attempt, aiService, mastery };
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

describe('FillInBlankEvaluationProcessor counting', () => {
    const jobWith = (data: Record<string, unknown>) => ({ id: 'j1', data: { ...jobData, ...data }, attemptsMade: 0, opts: { attempts: 3 }, discard: jest.fn(), timestamp: 0 });

    const build = (opts: Parameters<typeof buildProcessorFor>[0]) => buildProcessorFor(opts);

    test('a retry of an attempt that was already applied does nothing: no AI call and no second Pass', async () => {
        // Arrange: the trainer already carries this submit time, as after a commit that was followed by a failed retry
        const { processor, aiService, attempt, lock } = build({ trainer: { ...baseTrainer, lastExamSubmittedAt: new Date(SUBMITTED_AT) } });

        // Act
        await processor.processFillInBlankEvaluation(jobWith({}) as never);

        // Assert
        expect(aiService.evaluateAllFillInBlankAnswers).not.toHaveBeenCalled();
        expect(attempt.applyAttemptTx).not.toHaveBeenCalled();
        expect(lock.releaseIfOwned).toHaveBeenCalledWith('u1', 'tok');
    });

    test('applies the decision stored in the job and does not decide again', async () => {
        // Arrange
        const { processor, attempt } = build({});

        // Act
        await processor.processFillInBlankEvaluation(jobWith({ countsAsAttempt: false }) as never);

        // Assert
        expect(attempt.applyAttemptTx).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ counts: false, submittedAt: new Date(SUBMITTED_AT) }));
    });

    test('a trainer deleted before the job runs: no AI call, nothing written, no error', async () => {
        // Arrange
        const { processor, aiService, trainerRepository, lock } = build({ trainer: null });

        // Act
        const result = await processor.processFillInBlankEvaluation(jobWith({}) as never);

        // Assert
        expect(result).toEqual({ results: [], trainerDeleted: true });
        expect(aiService.evaluateAllFillInBlankAnswers).not.toHaveBeenCalled();
        expect(trainerRepository.createVocabTrainerResultsMany).not.toHaveBeenCalled();
        expect(lock.releaseIfOwned).toHaveBeenCalledWith('u1', 'tok');
    });

    test('a trainer deleted while the AI runs: nothing is written and the job still completes', async () => {
        // Arrange
        const { processor, attempt, trainerRepository, lock, gateway, aiService } = build({ lockedTrainer: null });
        aiService.evaluateAllFillInBlankAnswers.mockResolvedValue([{ isCorrect: true }]);

        // Act
        const result = await processor.processFillInBlankEvaluation(jobWith({}) as never);

        // Assert
        expect(result).toEqual(expect.objectContaining({ trainerDeleted: true }));
        expect(trainerRepository.createVocabTrainerResultsMany).not.toHaveBeenCalled();
        expect(attempt.applyAttemptTx).not.toHaveBeenCalled();
        expect(gateway.emitFillInBlankEvaluationProgress).toHaveBeenLastCalledWith('u1', 'j1', 'completed', expect.anything());
        expect(lock.releaseIfOwned).toHaveBeenCalledWith('u1', 'tok');
    });

    test('the bells run after the commit, once the attempt is applied', async () => {
        // Arrange
        const { processor, attempt, aiService, trainerRepository } = build({});
        aiService.evaluateAllFillInBlankAnswers.mockResolvedValue([{ isCorrect: true }]);

        // Act
        await processor.processFillInBlankEvaluation(jobWith({}) as never);

        // Assert
        const tx = trainerRepository.inTransaction.mock.invocationCallOrder[0];
        expect(attempt.afterCommit).toHaveBeenCalledTimes(1);
        expect(attempt.afterCommit.mock.invocationCallOrder[0]).toBeGreaterThan(tx);
    });

    test('the apply transaction runs through runSerializableWithRetry: a write conflict thrown once is retried, and the attempt is applied', async () => {
        // Arrange
        const { processor, attempt, aiService, trainerRepository } = build({});
        aiService.evaluateAllFillInBlankAnswers.mockResolvedValue([{ isCorrect: true }]);
        trainerRepository.inTransaction.mockImplementationOnce(async (fn: (tx: object) => Promise<unknown>) => {
            await fn({});
            throw writeConflict();
        });

        // Act
        const result = await processor.processFillInBlankEvaluation(jobWith({}) as never);

        // Assert
        expect(trainerRepository.runSerializableWithRetry).toHaveBeenCalledTimes(1);
        expect(trainerRepository.inTransaction).toHaveBeenCalledTimes(2);
        expect(attempt.afterCommit).toHaveBeenCalledTimes(1);
        expect(result).toEqual(expect.objectContaining({ results: expect.any(Array) }));
    });
});

function buildProcessorFor(opts: { trainer?: Record<string, unknown> | null; lockedTrainer?: Record<string, unknown> | null; aiError?: Error }) {
    const gateway = { emitFillInBlankEvaluationProgress: jest.fn() };
    const lock = { isOwner: jest.fn().mockResolvedValue(true), refreshLock: jest.fn(), releaseIfOwned: jest.fn() };
    const aiService = { evaluateAllFillInBlankAnswers: jest.fn().mockResolvedValue([{ isCorrect: true }]) };
    if (opts.aiError) {
        aiService.evaluateAllFillInBlankAnswers.mockRejectedValue(opts.aiError);
    }
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const trainerRepository = {
        findVocabTrainerByIdMinimal: jest.fn().mockResolvedValue(opts.trainer === undefined ? baseTrainer : opts.trainer),
        lockAndFindForUpdate: jest.fn().mockResolvedValue(opts.lockedTrainer === undefined ? baseTrainer : opts.lockedTrainer),
        inTransaction: jest.fn(async (fn: (tx: object) => Promise<unknown>) => {
            const result = await fn({});
            return result;
        }),
        runSerializableWithRetry: jest.fn(async (fn: (tx: object) => Promise<unknown>) => {
            const result = await retryOn(trainerRepository, fn);
            return result;
        }),
        deleteVocabTrainerResults: jest.fn().mockResolvedValue(undefined),
        createVocabTrainerResultsMany: jest.fn().mockResolvedValue(undefined),
        findResultsByTrainerId: jest.fn().mockResolvedValue([]),
    };
    const attempt = {
        applyAttemptTx: jest.fn((_tx: unknown, input: { counts: boolean; submittedAt: Date }) => ({
            counts: input.counts,
            passed: true,
            completed: false,
            trainerId: 't1',
            userId: 'u1',
            trainerName: 'Week 1',
            maxRepeat: 6,
            passes: 2,
            trainer: baseTrainer,
        })),
        afterCommit: jest.fn().mockResolvedValue(undefined),
    };
    const userRepository = { findById: jest.fn().mockResolvedValue({ id: 'u1', email: 'a@example.com', firstName: 'A', lastName: 'B' }) };
    const mastery = { updateMastery: jest.fn().mockResolvedValue(undefined) };
    const processor = new FillInBlankEvaluationProcessor(
        logger as never,
        aiService as never,
        lock as never,
        gateway as never,
        trainerRepository as never,
        userRepository as never,
        mastery as never,
        attempt as never,
    );

    return { processor, gateway, lock, aiService, trainerRepository, attempt };
}
