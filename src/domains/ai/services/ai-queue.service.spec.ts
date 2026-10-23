import { AiConflictException } from '../exceptions';
import { AiQueueService } from './ai-queue.service';

describe('AiQueueService', () => {
    const fibParams = { vocabTrainerId: 't1', userId: 'u1', jobType: 'fill-in-blank', queueName: 'fill-in-blank-evaluation' } as const;

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
