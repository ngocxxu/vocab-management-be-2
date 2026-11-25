import { AiConflictException } from '../exceptions';
import { AiQueueService } from './ai-queue.service';

describe('AiQueueService', () => {
    const fibParams = {
        vocabTrainerId: 't1',
        userId: 'u1',
        jobType: 'fill-in-blank',
        queueName: 'fill-in-blank-evaluation',
        decideAttempt: jest.fn().mockResolvedValue({ countsAsAttempt: true, submittedAt: '2026-11-23T10:00:00.000Z' }),
        recordAttempt: jest.fn().mockResolvedValue(jest.fn().mockResolvedValue(undefined)),
    } as const;

    const activeJob = (overrides: Record<string, unknown> = {}) => ({
        jobId: 'active-job',
        lockToken: 'tok',
        queueName: 'fill-in-blank-evaluation',
        trainerId: 't1',
        jobType: 'fill-in-blank',
        userId: 'u1',
        createdAt: '2026-01-01T00:00:00.000Z',
        attempt: 0,
        ...overrides,
    });

    const build = () => {
        const fillInBlankProducer = { evaluateAnswers: jest.fn().mockResolvedValue({ jobId: 'new-job' }), getJob: jest.fn() };
        const audioProducer = { getJob: jest.fn() };
        const multipleChoiceProducer = { getJob: jest.fn() };
        const fillInBlankChoiceProducer = { getJob: jest.fn() };
        const lock = {
            acquireOrGetActive: jest.fn(),
            releaseIfOwned: jest.fn(),
            toResponse: jest.fn((job: Record<string, unknown>) => ({ jobId: job.jobId, trainerId: job.trainerId, jobType: job.jobType, queueName: job.queueName })),
        };
        const service = new AiQueueService(
            audioProducer as never,
            multipleChoiceProducer as never,
            fillInBlankChoiceProducer as never,
            fillInBlankProducer as never,
            lock as never,
        );

        return { service, lock, fillInBlankProducer, audioProducer, multipleChoiceProducer, fillInBlankChoiceProducer };
    };

    describe('queueFillInBlankEvaluation', () => {
        test('enqueues when the lock is free', async () => {
            // Arrange
            const { service, lock, fillInBlankProducer } = build();
            lock.acquireOrGetActive.mockResolvedValue({ acquired: true, job: activeJob({ jobId: 'new-job' }) });

            // Act
            const result = await service.queueFillInBlankEvaluation({ ...fibParams, evaluations: [], answerSubmissions: [] } as never);

            // Assert
            expect(result).toEqual({ jobId: 'new-job' });
            expect(fillInBlankProducer.evaluateAnswers).toHaveBeenCalledTimes(1);
        });

        test('re-attaches to the running job of the same trainer and type without enqueueing', async () => {
            // Arrange
            const { service, lock, fillInBlankProducer } = build();
            lock.acquireOrGetActive.mockResolvedValue({ acquired: false, activeJob: activeJob() });

            // Act
            const result = await service.queueFillInBlankEvaluation({ ...fibParams, evaluations: [], answerSubmissions: [] } as never);

            // Assert
            expect(result.jobId).toBe('active-job');
            expect(result.activeJob).toBeDefined();
            expect(fillInBlankProducer.evaluateAnswers).not.toHaveBeenCalled();
        });

        test('throws a conflict when the lock is held by another trainer', async () => {
            // Arrange
            const { service, lock, fillInBlankProducer } = build();
            lock.acquireOrGetActive.mockResolvedValue({ acquired: false, activeJob: activeJob({ trainerId: 'other-trainer' }) });

            // Act + Assert
            await expect(service.queueFillInBlankEvaluation({ ...fibParams, evaluations: [], answerSubmissions: [] } as never)).rejects.toBeInstanceOf(AiConflictException);
            expect(fillInBlankProducer.evaluateAnswers).not.toHaveBeenCalled();
        });

        test('throws a conflict when the same trainer is busy with a different job type', async () => {
            // Arrange
            const { service, lock } = build();
            lock.acquireOrGetActive.mockResolvedValue({ acquired: false, activeJob: activeJob({ jobType: 'multiple-choice' }) });

            // Act + Assert
            await expect(service.queueFillInBlankEvaluation({ ...fibParams, evaluations: [], answerSubmissions: [] } as never)).rejects.toBeInstanceOf(AiConflictException);
        });

        test('releases the lock when enqueueing fails', async () => {
            // Arrange
            const { service, lock, fillInBlankProducer } = build();
            lock.acquireOrGetActive.mockResolvedValue({ acquired: true, job: activeJob({ jobId: 'new-job' }) });
            fillInBlankProducer.evaluateAnswers.mockRejectedValue(new Error('redis down'));

            // Act + Assert
            await expect(service.queueFillInBlankEvaluation({ ...fibParams, evaluations: [], answerSubmissions: [] } as never)).rejects.toThrow('redis down');
            expect(lock.releaseIfOwned).toHaveBeenCalledWith('u1', 'tok');
        });
    });

    describe('queueFillInBlankEvaluation: counting decision', () => {
        const decision = { countsAsAttempt: true, submittedAt: '2026-11-23T10:00:00.000Z' };

        test('decides whether the attempt counts only once the lock is held, and stores the answer in the job', async () => {
            // Arrange
            const { service, lock, fillInBlankProducer } = build();
            lock.acquireOrGetActive.mockResolvedValue({ acquired: true, job: activeJob({ jobId: 'new-job' }) });
            const decideAttempt = jest.fn().mockResolvedValue(decision);

            // Act
            await service.queueFillInBlankEvaluation({ ...fibParams, evaluations: [], answerSubmissions: [], decideAttempt } as never);

            // Assert
            expect(decideAttempt).toHaveBeenCalledTimes(1);
            const jobData = fillInBlankProducer.evaluateAnswers.mock.calls[0][0] as Record<string, unknown>;
            expect(jobData).toMatchObject({ countsAsAttempt: true, submittedAt: decision.submittedAt });
            expect(jobData).not.toHaveProperty('decideAttempt');
        });

        test('a submit that re-attaches to the running job never decides, so it cannot count again', async () => {
            // Arrange
            const { service, lock } = build();
            lock.acquireOrGetActive.mockResolvedValue({ acquired: false, activeJob: activeJob() });
            const decideAttempt = jest.fn().mockResolvedValue(decision);

            // Act
            await service.queueFillInBlankEvaluation({ ...fibParams, evaluations: [], answerSubmissions: [], decideAttempt } as never);

            // Assert
            expect(decideAttempt).not.toHaveBeenCalled();
        });

        test('a submit refused by another trainer job never decides', async () => {
            // Arrange
            const { service, lock } = build();
            lock.acquireOrGetActive.mockResolvedValue({ acquired: false, activeJob: activeJob({ trainerId: 'other' }) });
            const decideAttempt = jest.fn().mockResolvedValue(decision);

            // Act
            await expect(service.queueFillInBlankEvaluation({ ...fibParams, evaluations: [], answerSubmissions: [], decideAttempt } as never)).rejects.toBeInstanceOf(
                AiConflictException,
            );

            // Assert
            expect(decideAttempt).not.toHaveBeenCalled();
        });
    });

    describe('queueFillInBlankEvaluation: recording the submit (#17)', () => {
        const decision = { countsAsAttempt: true, submittedAt: '2026-11-23T10:00:00.000Z' };

        test('records the submit after the lock is held and before the job is queued', async () => {
            // Arrange
            const { service, lock, fillInBlankProducer } = build();
            lock.acquireOrGetActive.mockResolvedValue({ acquired: true, job: activeJob({ jobId: 'new-job' }) });
            const recordAttempt = jest.fn().mockResolvedValue(jest.fn().mockResolvedValue(undefined));
            const order: string[] = [];
            recordAttempt.mockImplementation(() => {
                order.push('record');
                return jest.fn().mockResolvedValue(undefined);
            });
            fillInBlankProducer.evaluateAnswers.mockImplementation(() => {
                order.push('enqueue');
                return { jobId: 'new-job' };
            });

            // Act
            await service.queueFillInBlankEvaluation({ ...fibParams, evaluations: [], answerSubmissions: [], recordAttempt } as never);

            // Assert
            expect(recordAttempt).toHaveBeenCalledWith(decision);
            expect(order).toEqual(['record', 'enqueue']);
        });

        test('undoes the recorded submit and releases the lock when enqueueing fails', async () => {
            // Arrange
            const { service, lock, fillInBlankProducer } = build();
            lock.acquireOrGetActive.mockResolvedValue({ acquired: true, job: activeJob({ jobId: 'new-job' }) });
            const undo = jest.fn().mockResolvedValue(undefined);
            const recordAttempt = jest.fn().mockResolvedValue(undo);
            fillInBlankProducer.evaluateAnswers.mockRejectedValue(new Error('redis down'));

            // Act
            await expect(service.queueFillInBlankEvaluation({ ...fibParams, evaluations: [], answerSubmissions: [], recordAttempt } as never)).rejects.toThrow('redis down');

            // Assert
            expect(undo).toHaveBeenCalledTimes(1);
            expect(lock.releaseIfOwned).toHaveBeenCalledWith('u1', 'tok');
        });

        test('a failing record releases the lock and queues nothing', async () => {
            // Arrange
            const { service, lock, fillInBlankProducer } = build();
            lock.acquireOrGetActive.mockResolvedValue({ acquired: true, job: activeJob({ jobId: 'new-job' }) });
            const recordAttempt = jest.fn().mockRejectedValue(new Error('db down'));

            // Act
            await expect(service.queueFillInBlankEvaluation({ ...fibParams, evaluations: [], answerSubmissions: [], recordAttempt } as never)).rejects.toThrow('db down');

            // Assert
            expect(fillInBlankProducer.evaluateAnswers).not.toHaveBeenCalled();
            expect(lock.releaseIfOwned).toHaveBeenCalledWith('u1', 'tok');
        });
    });

    describe('queueRegrade (#17)', () => {
        const regradeParams = (claim: jest.Mock) => ({
            userId: 'u1',
            vocabTrainerId: 't1',
            jobType: 'fill-in-blank' as const,
            queueName: 'fill-in-blank-evaluation' as const,
            claim,
        });
        const payload = { vocabTrainerId: 't1', userId: 'u1', submittedAt: '2026-11-23T10:00:00.000Z', countsAsAttempt: true, evaluations: [], answerSubmissions: [] };

        test('queues the claimed payload with the job id and lock token of this lock', async () => {
            // Arrange
            const { service, lock, fillInBlankProducer } = build();
            lock.acquireOrGetActive.mockResolvedValue({ acquired: true, job: activeJob({ jobId: 'regrade-job' }) });
            const claim = jest.fn().mockResolvedValue({ payload, rollback: jest.fn() });

            // Act
            const result = await service.queueRegrade(regradeParams(claim) as never);

            // Assert
            expect(result).toEqual({ jobId: 'regrade-job' });
            expect(fillInBlankProducer.evaluateAnswers).toHaveBeenCalledWith(
                expect.objectContaining({ ...payload, jobType: 'fill-in-blank', queueName: 'fill-in-blank-evaluation', jobId: 'regrade-job', lockToken: 'tok' }),
                { jobId: 'regrade-job' },
            );
        });

        test('never re-attaches: a running job of the same trainer is a conflict', async () => {
            // Arrange
            const { service, lock, fillInBlankProducer } = build();
            lock.acquireOrGetActive.mockResolvedValue({ acquired: false, activeJob: activeJob() });
            const claim = jest.fn();

            // Act + Assert
            await expect(service.queueRegrade(regradeParams(claim) as never)).rejects.toBeInstanceOf(AiConflictException);
            expect(claim).not.toHaveBeenCalled();
            expect(fillInBlankProducer.evaluateAnswers).not.toHaveBeenCalled();
        });

        test('a claim that fails releases the lock and queues nothing', async () => {
            // Arrange
            const { service, lock, fillInBlankProducer } = build();
            lock.acquireOrGetActive.mockResolvedValue({ acquired: true, job: activeJob({ jobId: 'regrade-job' }) });
            const claim = jest.fn().mockRejectedValue(new Error('not regradable'));

            // Act + Assert
            await expect(service.queueRegrade(regradeParams(claim) as never)).rejects.toThrow('not regradable');
            expect(lock.releaseIfOwned).toHaveBeenCalledWith('u1', 'tok');
            expect(fillInBlankProducer.evaluateAnswers).not.toHaveBeenCalled();
        });

        test('an enqueue that fails rolls the claim back and releases the lock', async () => {
            // Arrange
            const { service, lock, fillInBlankProducer } = build();
            lock.acquireOrGetActive.mockResolvedValue({ acquired: true, job: activeJob({ jobId: 'regrade-job' }) });
            const rollback = jest.fn().mockResolvedValue(undefined);
            fillInBlankProducer.evaluateAnswers.mockRejectedValue(new Error('redis down'));

            // Act + Assert
            await expect(service.queueRegrade(regradeParams(jest.fn().mockResolvedValue({ payload, rollback })) as never)).rejects.toThrow('redis down');
            expect(rollback).toHaveBeenCalledTimes(1);
            expect(lock.releaseIfOwned).toHaveBeenCalledWith('u1', 'tok');
        });
    });

    describe('getJobStatus', () => {
        const bullJob = (data: Record<string, unknown>, state: string, extra: Record<string, unknown> = {}) => ({ data, getState: jest.fn().mockResolvedValue(state), ...extra });

        test('returns the completed result for the owner', async () => {
            // Arrange
            const { service, fillInBlankProducer } = build();
            fillInBlankProducer.getJob.mockResolvedValue(bullJob({ userId: 'u1', vocabTrainerId: 't1' }, 'completed', { returnvalue: { results: [] } }));

            // Act
            const status = await service.getJobStatus('u1', 't1', 'j1');

            // Assert
            expect(status).toMatchObject({ jobId: 'j1', status: 'completed', data: { results: [] } });
        });

        test('reports unknown for a job that belongs to another user', async () => {
            // Arrange
            const { service, fillInBlankProducer } = build();
            fillInBlankProducer.getJob.mockResolvedValue(bullJob({ userId: 'someone-else', vocabTrainerId: 't1' }, 'completed', { returnvalue: { results: [] } }));

            // Act
            const status = await service.getJobStatus('u1', 't1', 'j1');

            // Assert
            expect(status.status).toBe('unknown');
            expect(status.data).toBeUndefined();
        });

        test('reports unknown for a job of another trainer', async () => {
            // Arrange
            const { service, fillInBlankProducer } = build();
            fillInBlankProducer.getJob.mockResolvedValue(bullJob({ userId: 'u1', vocabTrainerId: 'other' }, 'active'));

            // Act + Assert
            expect((await service.getJobStatus('u1', 't1', 'j1')).status).toBe('unknown');
        });

        test('reports unknown when no queue has the job', async () => {
            // Arrange
            const { service } = build();

            // Act + Assert
            expect((await service.getJobStatus('u1', 't1', 'gone')).status).toBe('unknown');
        });

        test('reports a failed job with its reason', async () => {
            // Arrange
            const { service, audioProducer } = build();
            audioProducer.getJob.mockResolvedValue(bullJob({ userId: 'u1', vocabTrainerId: 't1' }, 'failed', { failedReason: 'timed out' }));

            // Act
            const status = await service.getJobStatus('u1', 't1', 'j1');

            // Assert
            expect(status).toMatchObject({ status: 'failed', error: 'timed out' });
        });
    });
});
