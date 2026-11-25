import { BaseRepository } from '@/database/base.repository';
import { VOCAB_TRAINER_AI_CONFIG } from '@/domains/ai/constants/vocab-trainer-job.constants';
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
        const lock = {
            isOwner: jest.fn().mockResolvedValue(opts.owns ?? true),
            refreshLock: jest.fn(),
            releaseIfOwned: jest.fn(),
            getActiveJob: jest.fn().mockResolvedValue(null),
        };
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
            findAttemptByTrainerId: jest.fn().mockResolvedValue(null),
            markAttemptGraded: jest.fn().mockResolvedValue(1),
            markAttemptGradingFailed: jest.fn().mockResolvedValue(1),
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
            { notifyGraded: jest.fn(), notifyFailed: jest.fn() } as never,
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

describe('FillInBlankEvaluationProcessor stale submits and grading state (#17)', () => {
    const jobWith = (data: Record<string, unknown>, attemptsMade = 0) => ({
        id: 'j1',
        data: { ...jobData, ...data },
        attemptsMade,
        opts: { attempts: 3 },
        discard: jest.fn(),
        timestamp: 0,
    });
    const OTHER_SUBMIT = new Date('2026-11-23T11:00:00.000Z');

    test('a job whose submit was replaced by a newer one calls no AI, writes nothing and counts no Pass', async () => {
        // Arrange
        const { processor, aiService, trainerRepository, attempt, lock } = buildProcessorFor({});
        trainerRepository.findAttemptByTrainerId.mockResolvedValue({ submittedAt: OTHER_SUBMIT });

        // Act
        await processor.processFillInBlankEvaluation(jobWith({}) as never);

        // Assert
        expect(aiService.evaluateAllFillInBlankAnswers).not.toHaveBeenCalled();
        expect(trainerRepository.deleteVocabTrainerResults).not.toHaveBeenCalled();
        expect(trainerRepository.markAttemptGraded).not.toHaveBeenCalled();
        expect(attempt.applyAttemptTx).not.toHaveBeenCalled();
        expect(lock.releaseIfOwned).toHaveBeenCalledWith('u1', 'tok');
    });

    test('a newer submit that lands after the early check is caught under the row lock: nothing is written', async () => {
        // Arrange: the early check sees this submit, the check under the lock sees a newer one
        const { processor, aiService, trainerRepository, attempt } = buildProcessorFor({});
        trainerRepository.findAttemptByTrainerId.mockResolvedValueOnce({ submittedAt: new Date(SUBMITTED_AT) }).mockResolvedValueOnce({ submittedAt: OTHER_SUBMIT });

        // Act
        await processor.processFillInBlankEvaluation(jobWith({}) as never);

        // Assert
        expect(aiService.evaluateAllFillInBlankAnswers).toHaveBeenCalledTimes(1);
        expect(trainerRepository.deleteVocabTrainerResults).not.toHaveBeenCalled();
        expect(trainerRepository.createVocabTrainerResultsMany).not.toHaveBeenCalled();
        expect(trainerRepository.markAttemptGraded).not.toHaveBeenCalled();
        expect(attempt.applyAttemptTx).not.toHaveBeenCalled();
    });

    test('a stale job does not mark grading_failed while another job holds the lock', async () => {
        // Arrange
        const { processor, lock, trainerRepository } = buildProcessorFor({});
        lock.isOwner.mockResolvedValue(false);
        lock.getActiveJob.mockResolvedValue({ jobId: 'regrade-job', lockToken: 'other-token' });

        // Act
        await expect(processor.processFillInBlankEvaluation(jobWith({}, 2) as never)).rejects.toThrow();

        // Assert
        expect(trainerRepository.markAttemptGradingFailed).not.toHaveBeenCalled();
    });

    test('a stale job marks grading_failed when no other job holds the lock', async () => {
        // Arrange
        const { processor, lock, trainerRepository } = buildProcessorFor({});
        lock.isOwner.mockResolvedValue(false);

        // Act
        await expect(processor.processFillInBlankEvaluation(jobWith({}, 2) as never)).rejects.toThrow();

        // Assert
        expect(trainerRepository.markAttemptGradingFailed).toHaveBeenCalledWith('t1', 'u1', new Date(SUBMITTED_AT));
    });

    test('a graded submit is marked graded in the same transaction as its results', async () => {
        // Arrange
        const { processor, trainerRepository, attempt } = buildProcessorFor({});
        trainerRepository.findAttemptByTrainerId.mockResolvedValue({ submittedAt: new Date(SUBMITTED_AT) });

        // Act
        await processor.processFillInBlankEvaluation(jobWith({}) as never);

        // Assert
        expect(trainerRepository.markAttemptGraded).toHaveBeenCalledWith('t1', 'u1', new Date(SUBMITTED_AT), expect.anything());
        const tx = trainerRepository.markAttemptGraded.mock.calls[0][3];
        expect(trainerRepository.createVocabTrainerResultsMany.mock.calls[0][1]).toBe(tx);
        expect(attempt.applyAttemptTx.mock.calls[0][0]).toBe(tx);
    });

    test('the final failure marks the submit grading_failed for its own submit time, then reports and releases the lock', async () => {
        // Arrange
        const { processor, gateway, lock, trainerRepository } = buildProcessorFor({ aiError: new Error('provider down') });

        // Act
        await expect(processor.processFillInBlankEvaluation(jobWith({}, 2) as never)).rejects.toThrow('provider down');

        // Assert
        expect(trainerRepository.markAttemptGradingFailed).toHaveBeenCalledWith('t1', 'u1', new Date(SUBMITTED_AT));
        expect(gateway.emitFillInBlankEvaluationProgress).toHaveBeenLastCalledWith('u1', 'j1', 'failed', { error: 'provider down' });
        expect(lock.releaseIfOwned).toHaveBeenCalledWith('u1', 'tok');
    });

    test('a failed grading write does not block the lock release, and the job still fails with the original error', async () => {
        // Arrange
        const { processor, gateway, lock, trainerRepository } = buildProcessorFor({ aiError: new Error('provider down') });
        trainerRepository.markAttemptGradingFailed.mockRejectedValue(new Error('db down'));

        // Act
        await expect(processor.processFillInBlankEvaluation(jobWith({}, 2) as never)).rejects.toThrow('provider down');

        // Assert
        expect(lock.releaseIfOwned).toHaveBeenCalledWith('u1', 'tok');
        expect(gateway.emitFillInBlankEvaluationProgress).toHaveBeenLastCalledWith('u1', 'j1', 'failed', { error: 'provider down' });
    });

    test('a regrade job applies the counting decision stored in its submit and does not decide again', async () => {
        // Arrange
        const { processor, attempt } = buildProcessorFor({});

        // Act
        await processor.processFillInBlankEvaluation(jobWith({ countsAsAttempt: false }) as never);

        // Assert
        expect(attempt.applyAttemptTx.mock.calls[0][1]).toMatchObject({ counts: false });
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

    test('the completed payload carries each question text, so a socket client can show the prompt without a refetch', async () => {
        // Arrange
        const { processor, aiService } = build({});
        aiService.evaluateAllFillInBlankAnswers.mockResolvedValue([{ isCorrect: true, explanation: 'ok' }]);
        const evaluation = { ...jobData.evaluations[0], content: 'Please turn off the light' };

        // Act
        const result = await processor.processFillInBlankEvaluation(jobWith({ evaluations: [evaluation] }) as never);

        // Assert
        expect(result).toEqual({
            results: [expect.objectContaining({ data: { explanation: 'ok', content: 'Please turn off the light' } })],
        });
    });
});

describe('FillInBlankEvaluationProcessor AI timeout and incomplete replies (#18)', () => {
    const AI_CALL_TIMEOUT_MS = VOCAB_TRAINER_AI_CONFIG.AI_CALL_TIMEOUT_SECONDS * 1000;
    type Grade = { isCorrect: boolean; explanation?: string };

    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    const jobAt = (attemptsMade: number, data: Record<string, unknown> = {}) => ({
        id: 'j1',
        data: { ...jobData, ...data },
        attemptsMade,
        opts: { attempts: 3 },
        discard: jest.fn(),
        timestamp: 0,
    });

    /** One attempt whose AI call never answers. Moves the fake clock past the AI call timeout and resolves with the error the attempt threw. */
    const runAttemptWithHangingAi = async (processor: FillInBlankEvaluationProcessor, job: object): Promise<unknown> => {
        const outcome = processor.processFillInBlankEvaluation(job as never).then(
            () => undefined,
            (error: unknown) => error,
        );
        await jest.advanceTimersByTimeAsync(0);
        await jest.advanceTimersByTimeAsync(AI_CALL_TIMEOUT_MS);
        return outcome;
    };

    test('a hanging AI call on attempt 1 is retried quietly: no failed event, no discard, lock kept', async () => {
        // Arrange
        const { processor, gateway, lock, aiService } = buildProcessorFor({});
        aiService.evaluateAllFillInBlankAnswers.mockReturnValue(new Promise<Grade[]>(() => undefined));
        const job = jobAt(0);

        // Act
        const error = await runAttemptWithHangingAi(processor, job);

        // Assert
        expect(error).toHaveProperty('name', 'AiCallTimeoutError');
        expect(gateway.emitFillInBlankEvaluationProgress).toHaveBeenLastCalledWith('u1', 'j1', 'evaluating');
        expect(gateway.emitFillInBlankEvaluationProgress).not.toHaveBeenCalledWith('u1', 'j1', 'failed', expect.anything());
        expect(lock.releaseIfOwned).not.toHaveBeenCalled();
        expect(job.discard).not.toHaveBeenCalled();
    });

    test('a hanging AI call on attempt 2 is retried quietly too', async () => {
        // Arrange
        const { processor, gateway, lock, aiService } = buildProcessorFor({});
        aiService.evaluateAllFillInBlankAnswers.mockReturnValue(new Promise<Grade[]>(() => undefined));
        const job = jobAt(1);

        // Act
        const error = await runAttemptWithHangingAi(processor, job);

        // Assert
        expect(error).toHaveProperty('name', 'AiCallTimeoutError');
        expect(gateway.emitFillInBlankEvaluationProgress).toHaveBeenLastCalledWith('u1', 'j1', 'evaluating');
        expect(gateway.emitFillInBlankEvaluationProgress).not.toHaveBeenCalledWith('u1', 'j1', 'failed', expect.anything());
        expect(lock.releaseIfOwned).not.toHaveBeenCalled();
        expect(job.discard).not.toHaveBeenCalled();
    });

    test('a hanging AI call on attempt 3 fails: grading_failed and a failed event, no result rows, no Pass', async () => {
        // Arrange
        const { processor, gateway, lock, aiService, trainerRepository, attempt } = buildProcessorFor({});
        aiService.evaluateAllFillInBlankAnswers.mockReturnValue(new Promise<Grade[]>(() => undefined));

        // Act
        const error = await runAttemptWithHangingAi(processor, jobAt(2));

        // Assert
        expect(error).toHaveProperty('name', 'AiCallTimeoutError');
        expect(trainerRepository.markAttemptGradingFailed).toHaveBeenCalledWith('t1', 'u1', new Date(SUBMITTED_AT));
        expect(gateway.emitFillInBlankEvaluationProgress).toHaveBeenLastCalledWith('u1', 'j1', 'failed', { error: 'Fill-in-blank evaluation timed out after 30000ms' });
        expect(lock.releaseIfOwned).toHaveBeenCalledWith('u1', 'tok');
        expect(trainerRepository.runSerializableWithRetry).not.toHaveBeenCalled();
        expect(trainerRepository.createVocabTrainerResultsMany).not.toHaveBeenCalled();
        expect(attempt.applyAttemptTx).not.toHaveBeenCalled();
        expect(attempt.afterCommit).not.toHaveBeenCalled();
    });

    test('a late reply to an abandoned AI call is ignored: the final attempt still fails and writes nothing', async () => {
        // Arrange
        const { processor, gateway, aiService, trainerRepository, attempt } = buildProcessorFor({});
        let replyLate: (grades: Grade[]) => void = () => undefined;
        aiService.evaluateAllFillInBlankAnswers.mockReturnValue(
            new Promise<Grade[]>((resolve) => {
                replyLate = resolve;
            }),
        );

        // Act
        const error = await runAttemptWithHangingAi(processor, jobAt(2));
        replyLate([{ isCorrect: true, explanation: 'late' }]);
        await jest.advanceTimersByTimeAsync(0);

        // Assert
        expect(error).toHaveProperty('name', 'AiCallTimeoutError');
        expect(gateway.emitFillInBlankEvaluationProgress).toHaveBeenLastCalledWith('u1', 'j1', 'failed', expect.anything());
        expect(gateway.emitFillInBlankEvaluationProgress).not.toHaveBeenCalledWith('u1', 'j1', 'completed', expect.anything());
        expect(trainerRepository.createVocabTrainerResultsMany).not.toHaveBeenCalled();
        expect(trainerRepository.runSerializableWithRetry).not.toHaveBeenCalled();
        expect(attempt.applyAttemptTx).not.toHaveBeenCalled();
    });

    test('a partial AI reply fails the attempt as retryable: no failed event, no discard, nothing written', async () => {
        // Arrange: one answer was sent, the reply has no result for it
        const { processor, gateway, lock, aiService, trainerRepository, attempt } = buildProcessorFor({});
        aiService.evaluateAllFillInBlankAnswers.mockResolvedValue([]);
        const job = jobAt(0);

        // Act & Assert
        await expect(processor.processFillInBlankEvaluation(job as never)).rejects.toHaveProperty('name', 'AiIncompleteResponseError');
        expect(job.discard).not.toHaveBeenCalled();
        expect(gateway.emitFillInBlankEvaluationProgress).toHaveBeenLastCalledWith('u1', 'j1', 'evaluating');
        expect(gateway.emitFillInBlankEvaluationProgress).not.toHaveBeenCalledWith('u1', 'j1', 'failed', expect.anything());
        expect(lock.releaseIfOwned).not.toHaveBeenCalled();
        expect(trainerRepository.createVocabTrainerResultsMany).not.toHaveBeenCalled();
        expect(trainerRepository.runSerializableWithRetry).not.toHaveBeenCalled();
        expect(attempt.applyAttemptTx).not.toHaveBeenCalled();
    });

    test('a partial AI reply on the final attempt marks grading_failed and writes no result rows', async () => {
        // Arrange
        const { processor, gateway, aiService, trainerRepository, attempt } = buildProcessorFor({});
        aiService.evaluateAllFillInBlankAnswers.mockResolvedValue([]);

        // Act & Assert
        await expect(processor.processFillInBlankEvaluation(jobAt(2) as never)).rejects.toHaveProperty('name', 'AiIncompleteResponseError');
        expect(trainerRepository.markAttemptGradingFailed).toHaveBeenCalledWith('t1', 'u1', new Date(SUBMITTED_AT));
        expect(gateway.emitFillInBlankEvaluationProgress).toHaveBeenLastCalledWith('u1', 'j1', 'failed', expect.anything());
        expect(trainerRepository.createVocabTrainerResultsMany).not.toHaveBeenCalled();
        expect(attempt.applyAttemptTx).not.toHaveBeenCalled();
    });

    test('passes the job id and the attempt number to the AI call, for the diagnostics line', async () => {
        // Arrange
        const { processor, aiService } = buildProcessorFor({});

        // Act
        await processor.processFillInBlankEvaluation(jobAt(1) as never);

        // Assert: attemptsMade 1 means this run is attempt 2
        expect(aiService.evaluateAllFillInBlankAnswers).toHaveBeenCalledWith(expect.any(Array), 'u1', undefined, { jobId: 'j1', attempt: 2 });
    });

    test('a timeout logs one failure line with kind=timeout, the attempt and the job id', async () => {
        // Arrange
        const { processor, aiService, logger } = buildProcessorFor({});
        aiService.evaluateAllFillInBlankAnswers.mockReturnValue(new Promise<Grade[]>(() => undefined));

        // Act
        await runAttemptWithHangingAi(processor, jobAt(0));

        // Assert
        expect(logger.error).toHaveBeenCalledTimes(1);
        expect(logger.error).toHaveBeenCalledWith('Fill-in-blank evaluation job j1 attempt 1 failed: kind=timeout error=AiCallTimeoutError final=false');
    });

    test('an incomplete reply on the final attempt logs kind=incomplete', async () => {
        // Arrange
        const { processor, aiService, logger } = buildProcessorFor({});
        aiService.evaluateAllFillInBlankAnswers.mockResolvedValue([]);

        // Act
        await expect(processor.processFillInBlankEvaluation(jobAt(2) as never)).rejects.toThrow();

        // Assert
        expect(logger.error).toHaveBeenCalledTimes(1);
        expect(logger.error).toHaveBeenCalledWith('Fill-in-blank evaluation job j1 attempt 3 failed: kind=incomplete error=AiIncompleteResponseError final=true');
    });

    test('a provider error logs kind=other and never its text, which can echo the student answer', async () => {
        // Arrange
        const { processor, aiService, logger } = buildProcessorFor({});
        aiService.evaluateAllFillInBlankAnswers.mockRejectedValue(new SyntaxError('Unexpected token S in JSON: SECRET-ANSWER-TEXT'));
        const job = jobAt(0, { evaluations: [{ ...jobData.evaluations[0], userAnswer: 'SECRET-ANSWER-TEXT' }] });

        // Act
        await expect(processor.processFillInBlankEvaluation(job as never)).rejects.toThrow(SyntaxError);

        // Assert
        expect(logger.error).toHaveBeenCalledWith('Fill-in-blank evaluation job j1 attempt 1 failed: kind=other error=SyntaxError final=false');
        expect(JSON.stringify(logger.error.mock.calls)).not.toContain('SECRET-ANSWER-TEXT');
    });
});

function buildProcessorFor(opts: { trainer?: Record<string, unknown> | null; lockedTrainer?: Record<string, unknown> | null; aiError?: Error }) {
    const gateway = { emitFillInBlankEvaluationProgress: jest.fn() };
    const lock = { isOwner: jest.fn().mockResolvedValue(true), refreshLock: jest.fn(), releaseIfOwned: jest.fn(), getActiveJob: jest.fn().mockResolvedValue(null) };
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
        findAttemptByTrainerId: jest.fn().mockResolvedValue(null),
        markAttemptGraded: jest.fn().mockResolvedValue(1),
        markAttemptGradingFailed: jest.fn().mockResolvedValue(1),
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
    const notifications = { notifyGraded: jest.fn(), notifyFailed: jest.fn() };
    const processor = new FillInBlankEvaluationProcessor(
        logger as never,
        aiService as never,
        lock as never,
        gateway as never,
        trainerRepository as never,
        userRepository as never,
        mastery as never,
        attempt as never,
        notifications as never,
    );

    return { processor, gateway, lock, aiService, trainerRepository, attempt, notifications, logger };
}
