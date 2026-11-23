import { TrainerStatus } from '@prisma/client';
import { StaleAiJobError } from '../utils/ai-job.util';
import { AudioEvaluationProcessor } from './audio-evaluation.processor';

type AttemptRow = { submittedAt: Date } | null;

const SUBMITTED_AT = '2026-11-23T10:00:00.000Z';
const ENQUEUED_AT_MS = 1_700_000_000_000;
const matching: AttemptRow = { submittedAt: new Date(SUBMITTED_AT) };
const newer: AttemptRow = { submittedAt: new Date('2026-11-23T11:00:00.000Z') };

const jobData = {
    vocabTrainerId: 't1',
    userId: 'u1',
    lockToken: 'tok',
    fileId: 'file-1',
    targetDialogue: [{ text: 'Hello' }, { text: 'Goodbye' }],
    sourceLanguageCode: 'en',
    targetLanguageCode: 'vi',
    sourceWords: ['hello'],
    targetStyle: 'casual',
    targetAudience: 'students',
    locale: 'en',
    submittedAt: SUBMITTED_AT,
};

type BuildOptions = {
    owns?: boolean;
    aiError?: Error;
    trainerRow?: { id: string } | null;
    /** The stored submit read before the AI call, and the one read under the trainer row lock. */
    reads?: [AttemptRow, AttemptRow];
    createError?: Error;
    gradingError?: Error;
};

const build = (opts: BuildOptions = {}) => {
    const tx = { tag: 'tx' };
    const [before, inTx] = opts.reads ?? [matching, matching];
    const gateway = { emitAudioEvaluationProgress: jest.fn() };
    const lock = {
        isOwner: jest.fn().mockResolvedValue(opts.owns ?? true),
        refreshLock: jest.fn().mockResolvedValue(undefined),
        releaseIfOwned: jest.fn().mockResolvedValue(undefined),
        getActiveJob: jest.fn().mockResolvedValue(null),
    };
    const aiService = {
        downloadAudioFromCloudinary: jest.fn().mockResolvedValue(Buffer.from('audio')),
        transcribeAudio: jest.fn().mockResolvedValue('transcript'),
        evaluateTranslation: opts.aiError ? jest.fn().mockRejectedValue(opts.aiError) : jest.fn().mockResolvedValue({ score: 80 }),
        formatMarkdownReport: jest.fn().mockReturnValue('# report'),
    };
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const repository = {
        findAttemptByTrainerId: jest.fn().mockResolvedValueOnce(before).mockResolvedValue(inTx),
        runSerializableWithRetry: jest.fn(async (work: (t: object) => Promise<unknown>) => work(tx)),
        lockAndFindForUpdate: jest.fn().mockResolvedValue(opts.trainerRow === undefined ? { id: 't1' } : opts.trainerRow),
        deleteVocabTrainerResults: jest.fn().mockResolvedValue(undefined),
        createVocabTrainerResult: opts.createError ? jest.fn().mockRejectedValue(opts.createError) : jest.fn().mockResolvedValue(undefined),
        markAttemptGraded: jest.fn().mockResolvedValue(1),
        markAttemptGradingFailed: opts.gradingError ? jest.fn().mockRejectedValue(opts.gradingError) : jest.fn().mockResolvedValue(1),
    };
    const processor = new AudioEvaluationProcessor(
        logger as never,
        aiService as never,
        lock as never,
        gateway as never,
        repository as never,
        { notifyGraded: jest.fn(), notifyFailed: jest.fn() } as never,
    );
    const jobWith = (data: Record<string, unknown> = {}, attemptsMade = 0) => ({
        id: 'j1',
        data: { ...jobData, ...data },
        attemptsMade,
        opts: { attempts: 3 },
        timestamp: ENQUEUED_AT_MS,
        discard: jest.fn(),
    });

    return { processor, tx, gateway, lock, aiService, repository, jobWith };
};

describe('AudioEvaluationProcessor grading state (#17)', () => {
    test('a fresh submit replaces the result and marks the attempt graded in the same transaction', async () => {
        // Arrange
        const { processor, tx, repository, gateway, lock, jobWith } = build();

        // Act
        const result = await processor.processAudioEvaluation(jobWith() as never);

        // Assert
        expect(repository.deleteVocabTrainerResults).toHaveBeenCalledWith('t1', tx);
        expect(repository.createVocabTrainerResult).toHaveBeenCalledWith(expect.objectContaining({ vocabTrainerId: 't1', status: TrainerStatus.COMPLETED }), tx);
        expect(repository.markAttemptGraded).toHaveBeenCalledWith('t1', 'u1', new Date(SUBMITTED_AT), tx);
        expect(result).toEqual({ transcript: 'transcript', markdownReport: '# report' });
        expect(gateway.emitAudioEvaluationProgress).toHaveBeenLastCalledWith('u1', 'j1', 'completed', expect.objectContaining({ transcript: 'transcript' }));
        expect(lock.releaseIfOwned).toHaveBeenCalledWith('u1', 'tok');
    });

    test('a submit replaced before the AI call is skipped and the AI is not called', async () => {
        // Arrange
        const { processor, aiService, repository, lock, jobWith } = build({ reads: [newer, newer] });

        // Act
        const result = await processor.processAudioEvaluation(jobWith() as never);

        // Assert
        expect(result).toEqual({ superseded: true });
        expect(aiService.downloadAudioFromCloudinary).not.toHaveBeenCalled();
        expect(repository.createVocabTrainerResult).not.toHaveBeenCalled();
        expect(repository.markAttemptGraded).not.toHaveBeenCalled();
        expect(lock.releaseIfOwned).toHaveBeenCalledWith('u1', 'tok');
    });

    test('a submit replaced while the AI ran writes nothing', async () => {
        // Arrange
        const { processor, repository, jobWith } = build({ reads: [matching, newer] });

        // Act
        const result = await processor.processAudioEvaluation(jobWith() as never);

        // Assert
        expect(result).toEqual({ superseded: true });
        expect(repository.deleteVocabTrainerResults).not.toHaveBeenCalled();
        expect(repository.createVocabTrainerResult).not.toHaveBeenCalled();
        expect(repository.markAttemptGraded).not.toHaveBeenCalled();
    });

    test('a trainer deleted while the AI ran writes nothing', async () => {
        // Arrange
        const { processor, repository, jobWith } = build({ trainerRow: null });

        // Act
        const result = await processor.processAudioEvaluation(jobWith() as never);

        // Assert
        expect(result).toEqual({ trainerDeleted: true });
        expect(repository.createVocabTrainerResult).not.toHaveBeenCalled();
        expect(repository.markAttemptGraded).not.toHaveBeenCalled();
    });

    test('a write error inside the transaction stops before the attempt is marked graded', async () => {
        // Arrange
        const { processor, repository, gateway, lock, jobWith } = build({ createError: new Error('disk full') });

        // Act
        await expect(processor.processAudioEvaluation(jobWith() as never)).rejects.toThrow('disk full');

        // Assert
        expect(repository.markAttemptGraded).not.toHaveBeenCalled();
        expect(repository.markAttemptGradingFailed).not.toHaveBeenCalled();
        expect(gateway.emitAudioEvaluationProgress).toHaveBeenLastCalledWith('u1', 'j1', 'evaluating');
        expect(lock.releaseIfOwned).not.toHaveBeenCalled();
    });

    test('a failure that will be retried does not mark grading_failed and keeps the lock', async () => {
        // Arrange
        const { processor, repository, gateway, lock, jobWith } = build({ aiError: new Error('provider down') });

        // Act
        await expect(processor.processAudioEvaluation(jobWith({}, 0) as never)).rejects.toThrow('provider down');

        // Assert
        expect(repository.markAttemptGradingFailed).not.toHaveBeenCalled();
        expect(lock.releaseIfOwned).not.toHaveBeenCalled();
        expect(gateway.emitAudioEvaluationProgress).toHaveBeenLastCalledWith('u1', 'j1', 'evaluating');
    });

    test('the final failure marks grading_failed, reports failed and releases the lock', async () => {
        // Arrange
        const { processor, repository, gateway, lock, jobWith } = build({ aiError: new Error('provider down') });

        // Act
        await expect(processor.processAudioEvaluation(jobWith({}, 2) as never)).rejects.toThrow('provider down');

        // Assert
        expect(repository.markAttemptGradingFailed).toHaveBeenCalledWith('t1', 'u1', new Date(SUBMITTED_AT));
        expect(gateway.emitAudioEvaluationProgress).toHaveBeenLastCalledWith('u1', 'j1', 'failed', { error: 'provider down' });
        expect(lock.releaseIfOwned).toHaveBeenCalledWith('u1', 'tok');
    });

    test('a grading_failed write that errors still releases the lock and rethrows the original error', async () => {
        // Arrange
        const { processor, lock, jobWith } = build({ aiError: new Error('provider down'), gradingError: new Error('db down') });

        // Act
        await expect(processor.processAudioEvaluation(jobWith({}, 2) as never)).rejects.toThrow('provider down');

        // Assert
        expect(lock.releaseIfOwned).toHaveBeenCalledWith('u1', 'tok');
    });

    test('a stale job is discarded and writes nothing', async () => {
        // Arrange
        const { processor, aiService, repository, jobWith } = build({ owns: false });
        const stale = jobWith();

        // Act
        await expect(processor.processAudioEvaluation(stale as never)).rejects.toBeInstanceOf(StaleAiJobError);

        // Assert
        expect(stale.discard).toHaveBeenCalledTimes(1);
        expect(aiService.downloadAudioFromCloudinary).not.toHaveBeenCalled();
        expect(repository.createVocabTrainerResult).not.toHaveBeenCalled();
    });

    test('a stale job marks grading_failed when no other job holds the lock', async () => {
        // Arrange
        const { processor, repository, lock, jobWith } = build({ owns: false });
        lock.getActiveJob.mockResolvedValue(null);

        // Act
        await expect(processor.processAudioEvaluation(jobWith() as never)).rejects.toBeInstanceOf(StaleAiJobError);

        // Assert
        expect(repository.markAttemptGradingFailed).toHaveBeenCalledWith('t1', 'u1', new Date(SUBMITTED_AT));
    });

    test('a stale job does not mark grading_failed while another job holds the lock', async () => {
        // Arrange
        const { processor, repository, lock, jobWith } = build({ owns: false });
        lock.getActiveJob.mockResolvedValue({ jobId: 'regrade-job', lockToken: 'other-token' });

        // Act
        await expect(processor.processAudioEvaluation(jobWith() as never)).rejects.toBeInstanceOf(StaleAiJobError);

        // Assert
        expect(repository.markAttemptGradingFailed).not.toHaveBeenCalled();
    });

    test('a job queued before #17 has no submit time: it uses its enqueue time and is not superseded', async () => {
        // Arrange
        const { processor, repository, jobWith } = build({ reads: [null, null] });

        // Act
        await processor.processAudioEvaluation(jobWith({ submittedAt: undefined }) as never);

        // Assert
        expect(repository.markAttemptGraded).toHaveBeenCalledWith('t1', 'u1', new Date(ENQUEUED_AT_MS), expect.anything());
    });
});
