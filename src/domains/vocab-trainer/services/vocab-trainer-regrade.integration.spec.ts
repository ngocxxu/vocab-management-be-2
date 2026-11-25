import redisConfig from '@/config/redis.config';
import { RedisKeyManager, RedisPrefix } from '@/shared';
import { PrismaService } from '@/shared/services/prisma.service';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { AiConflictException } from '../../ai/exceptions';
import { AudioEvaluationProcessor } from '../../ai/processors/audio-evaluation.processor';
import { AiQueueService } from '../../ai/services/ai-queue.service';
import { VocabTrainerJobLockService } from '../../ai/services/vocab-trainer-job-lock.service';
import { ReminderScheduleRepository } from '../../reminder/repositories/reminder-schedule.repository';
import { VocabTrainerReminderAfterExamService } from '../../reminder/services/vocab-trainer-reminder-after-exam.service';
import { VocabTrainerBadRequestException, VocabTrainerConflictException, VocabTrainerNotFoundException } from '../exceptions';
import { VocabTrainerRepository } from '../repositories';
import { VocabTrainerAttemptService } from './vocab-trainer-attempt.service';
import { VocabTrainerRegradeService } from './vocab-trainer-regrade.service';

// Runs against a real Postgres and a real Redis:
//   FSRS_TEST_DATABASE_URL=postgresql://admin:admin@localhost:5433/vocab_fsrs_test?schema=public pnpm test vocab-trainer-regrade.integration
const databaseUrl = process.env.FSRS_TEST_DATABASE_URL;
const describeWithDb = databaseUrl ? describe : describe.skip;
const { url: redisUrl } = redisConfig();

const SPEC_EMAIL = 'regrade-spec';
const SUBMITTED_AT = '2026-11-23T10:00:00.000Z';
const LATER_SUBMIT_AT = new Date('2026-11-23T11:00:00.000Z');

const FIB_SNAPSHOT = {
    locale: 'en',
    evaluations: [{ vocab: {}, userAnswer: 'a', systemAnswer: 'b', questionType: 'textSource', vocabId: 'v1' }],
    answerSubmissions: [{ userAnswer: 'a', systemAnswer: 'b' }],
};
const AUDIO_SNAPSHOT = {
    locale: 'en',
    fileId: 'file-1',
    targetDialogue: [{ text: 'Hello' }],
    sourceLanguageCode: 'en',
    targetLanguageCode: 'vi',
    sourceWords: ['hello'],
    targetStyle: 'casual',
    targetAudience: 'students',
};

describeWithDb('Regrade and grading state (real Postgres and Redis)', () => {
    let prisma: PrismaService;
    let redis: Redis;
    let lock: VocabTrainerJobLockService;
    let repository: VocabTrainerRepository;
    let attemptService: VocabTrainerAttemptService;
    let queue: AiQueueService;
    let regrade: VocabTrainerRegradeService;
    let fibProducer: { evaluateAnswers: jest.Mock };
    let audioProducer: { queueAudioEvaluation: jest.Mock };
    let aiService: { downloadAudioFromCloudinary: jest.Mock; transcribeAudio: jest.Mock; evaluateTranslation: jest.Mock; formatMarkdownReport: jest.Mock };
    let gateway: { emitAudioEvaluationProgress: jest.Mock };
    let owner: { id: string };
    let stranger: { id: string };
    let trainerId: string;

    const logger = { error: jest.fn(), warn: jest.fn(), info: jest.fn() };
    const unused = {} as never;
    const lockKey = (userId: string) => RedisKeyManager.generateKey(RedisPrefix.LOCK, 'vocab-trainer', 'user', userId);
    const attemptRow = async () => prisma.vocabTrainerAttempt.findUniqueOrThrow({ where: { trainerId } });
    const attemptRowOrNull = async () => prisma.vocabTrainerAttempt.findUnique({ where: { trainerId } });
    // Users default to GUEST, and a guest cannot submit audio, so the seeded users are members.
    const seedUser = async (label: string) =>
        prisma.user.create({ data: { email: `${SPEC_EMAIL}-${label}-${randomUUID()}@example.com`, firstName: 'Ada', lastName: 'Lovelace', role: 'MEMBER' } });
    // The trainer has one attempt at a time (trainerId is unique), so a seeded row replaces the previous one.
    const seedAttempt = async (
        data: { kind?: string; gradingStatus?: string; regradeCount?: number; countsAsAttempt?: boolean; submittedAt?: Date; answersSnapshot?: Prisma.InputJsonValue } = {},
    ) =>
        prisma.vocabTrainerAttempt.create({
            data: {
                trainerId,
                userId: owner.id,
                kind: 'fill-in-blank',
                submittedAt: new Date(SUBMITTED_AT),
                countsAsAttempt: true,
                gradingStatus: 'grading_failed',
                regradeCount: 0,
                answersSnapshot: FIB_SNAPSHOT,
                ...data,
            },
        });
    const makeAudioAttempt = async (data: { submittedAt?: Date; gradingStatus?: string } = {}) =>
        prisma.vocabTrainerAttempt.update({
            where: { trainerId },
            data: { kind: 'audio', countsAsAttempt: false, gradingStatus: 'grading', answersSnapshot: AUDIO_SNAPSHOT, ...data },
        });
    const oldResult = async () =>
        prisma.vocabTrainerResult.create({ data: { vocabTrainerId: trainerId, status: 'COMPLETED', userSelected: 'old', systemSelected: 'old', data: { transcript: 'old' } } });
    const fibHooks = () => attemptService.fillInBlankHooks(trainerId, owner.id, FIB_SNAPSHOT);
    const submitFillInBlank = async () =>
        queue.queueFillInBlankEvaluation({
            userId: owner.id,
            vocabTrainerId: trainerId,
            jobType: 'fill-in-blank',
            queueName: 'fill-in-blank-evaluation',
            evaluations: [],
            answerSubmissions: [],
            ...fibHooks(),
        } as never);

    /** An audio job whose user lock is taken under its own job id, as the submit would have done. */
    const audioJob = async (data: Record<string, unknown> = {}) => {
        const jobId = randomUUID();
        const acquired = await lock.acquireOrGetActive(owner.id, trainerId, 'audio-evaluation', 'audio', jobId);
        if (!acquired.acquired) {
            throw new Error('the spec could not take the job lock');
        }

        return {
            id: jobId,
            data: { vocabTrainerId: trainerId, userId: owner.id, lockToken: acquired.job.lockToken, ...AUDIO_SNAPSHOT, submittedAt: SUBMITTED_AT, ...data },
            attemptsMade: 0,
            opts: { attempts: 3 },
            timestamp: 0,
            discard: jest.fn(),
        };
    };
    const audioProcessor = () =>
        new AudioEvaluationProcessor(logger as never, aiService as never, lock, gateway as never, repository, { notifyGraded: jest.fn(), notifyFailed: jest.fn() } as never);

    beforeAll(async () => {
        prisma = new PrismaService({ datasources: { db: { url: databaseUrl } } });
        redis = new Redis(redisUrl);
        await prisma.$connect();

        lock = new VocabTrainerJobLockService({ client: redis } as never, logger as never);
        repository = new VocabTrainerRepository(prisma);
        attemptService = new VocabTrainerAttemptService(
            repository,
            new VocabTrainerReminderAfterExamService(),
            { hideTrainerBells: jest.fn().mockResolvedValue(undefined) } as never,
            { create: jest.fn().mockResolvedValue({ id: 'n1' }) } as never,
            logger as never,
            new ReminderScheduleRepository(prisma),
        );
        fibProducer = { evaluateAnswers: jest.fn().mockResolvedValue({ jobId: 'bull-fib' }) };
        audioProducer = { queueAudioEvaluation: jest.fn().mockResolvedValue({ jobId: 'bull-audio' }) };
        queue = new AiQueueService(audioProducer as never, unused, unused, fibProducer as never, lock);
        regrade = new VocabTrainerRegradeService(repository, {
            queueRegrade: async (params: Parameters<AiQueueService['queueRegrade']>[0]) => queue.queueRegrade(params),
        } as never);
        gateway = { emitAudioEvaluationProgress: jest.fn() };
        aiService = {
            downloadAudioFromCloudinary: jest.fn().mockResolvedValue(Buffer.from('audio')),
            transcribeAudio: jest.fn().mockResolvedValue('transcript'),
            evaluateTranslation: jest.fn().mockResolvedValue({}),
            formatMarkdownReport: jest.fn().mockReturnValue('# report'),
        };
    });

    afterAll(async () => {
        await prisma.user.deleteMany({ where: { email: { startsWith: SPEC_EMAIL } } });
        await prisma.$disconnect();
        redis.disconnect();
    });

    beforeEach(async () => {
        jest.clearAllMocks();
        await prisma.user.deleteMany({ where: { email: { startsWith: SPEC_EMAIL } } });
        owner = await seedUser('owner');
        stranger = await seedUser('stranger');
        const trainer = await prisma.vocabTrainer.create({
            data: { name: 'Fill in', status: 'PENDING', questionType: 'FILL_IN_THE_BLANK', reminderRepeat: 0, reminderMaxRepeat: 6, reminderSpacingDays: 2, userId: owner.id },
        });
        trainerId = trainer.id;
        await redis.del(lockKey(owner.id));
        await seedAttempt();
    });

    describe('regrade of a failed grading', () => {
        test('the owner regrades a failed submit: the row is grading again, one regrade is used, and the job carries the stored submit', async () => {
            // Act
            const dto = await regrade.regrade(trainerId, owner as never);

            // Assert
            expect(dto.jobId).toEqual(expect.any(String));
            expect(dto).toEqual(expect.objectContaining({ gradingStatus: 'grading', regradeCount: 1 }));
            expect(await attemptRow()).toEqual(expect.objectContaining({ gradingStatus: 'grading', regradeCount: 1 }));
            expect(fibProducer.evaluateAnswers).toHaveBeenCalledWith(
                expect.objectContaining({
                    vocabTrainerId: trainerId,
                    userId: owner.id,
                    submittedAt: SUBMITTED_AT,
                    countsAsAttempt: true,
                    locale: 'en',
                    answerSubmissions: [{ userAnswer: 'a', systemAnswer: 'b' }],
                    lockToken: expect.any(String),
                    jobId: dto.jobId,
                }),
                { jobId: dto.jobId },
            );
        });

        test('another user gets not found and the submit is untouched', async () => {
            // Act
            await expect(regrade.regrade(trainerId, stranger as never)).rejects.toBeInstanceOf(VocabTrainerNotFoundException);

            // Assert
            expect(await attemptRow()).toEqual(expect.objectContaining({ gradingStatus: 'grading_failed', regradeCount: 0 }));
            expect(fibProducer.evaluateAnswers).not.toHaveBeenCalled();
        });

        test('a submit whose grading did not fail cannot be regraded', async () => {
            // Arrange
            await prisma.vocabTrainerAttempt.update({ where: { trainerId }, data: { gradingStatus: 'graded' } });

            // Act & Assert
            await expect(regrade.regrade(trainerId, owner as never)).rejects.toBeInstanceOf(VocabTrainerConflictException);
            expect(fibProducer.evaluateAnswers).not.toHaveBeenCalled();
        });

        test('a submit with its two regrades used up is refused', async () => {
            // Arrange
            await prisma.vocabTrainerAttempt.update({ where: { trainerId }, data: { regradeCount: 2 } });

            // Act & Assert
            await expect(regrade.regrade(trainerId, owner as never)).rejects.toBeInstanceOf(VocabTrainerConflictException);
            expect(await attemptRow()).toEqual(expect.objectContaining({ gradingStatus: 'grading_failed', regradeCount: 2 }));
            expect(fibProducer.evaluateAnswers).not.toHaveBeenCalled();
        });

        test('a busy user lock refuses the regrade and the submit is untouched', async () => {
            // Arrange: another job of the same user holds the lock
            await lock.acquireOrGetActive(owner.id, 'other-trainer', 'audio-evaluation', 'audio', randomUUID());

            // Act & Assert
            await expect(regrade.regrade(trainerId, owner as never)).rejects.toBeInstanceOf(AiConflictException);
            expect(await attemptRow()).toEqual(expect.objectContaining({ gradingStatus: 'grading_failed', regradeCount: 0 }));
        });

        test('an enqueue failure puts the submit back as it was and releases the lock', async () => {
            // Arrange
            fibProducer.evaluateAnswers.mockRejectedValueOnce(new Error('queue down'));

            // Act & Assert
            await expect(regrade.regrade(trainerId, owner as never)).rejects.toThrow('queue down');
            expect(await attemptRow()).toEqual(expect.objectContaining({ gradingStatus: 'grading_failed', regradeCount: 0 }));
            expect(await lock.getActiveJob(owner.id)).toBeNull();
        });

        test('an audio submit is regraded from its stored recording and its counting is never re-decided', async () => {
            // Arrange
            await makeAudioAttempt({ gradingStatus: 'grading_failed' });

            // Act
            const dto = await regrade.regrade(trainerId, owner as never);

            // Assert
            expect(audioProducer.queueAudioEvaluation).toHaveBeenCalledWith(expect.objectContaining({ fileId: 'file-1', vocabTrainerId: trainerId, submittedAt: SUBMITTED_AT }), {
                jobId: dto.jobId,
            });
            expect(audioProducer.queueAudioEvaluation.mock.calls[0][0]).not.toHaveProperty('countsAsAttempt');
            expect(await attemptRow()).toEqual(expect.objectContaining({ gradingStatus: 'grading', regradeCount: 1 }));
        });

        test('a guest cannot regrade an audio submit, as a guest cannot submit one', async () => {
            // Arrange
            await makeAudioAttempt({ gradingStatus: 'grading_failed' });

            // Act & Assert
            await expect(regrade.regrade(trainerId, { ...owner, role: 'GUEST' } as never)).rejects.toBeInstanceOf(VocabTrainerBadRequestException);
            expect(audioProducer.queueAudioEvaluation).not.toHaveBeenCalled();
            expect(await attemptRow()).toEqual(expect.objectContaining({ gradingStatus: 'grading_failed', regradeCount: 0 }));
        });
    });

    describe('attempt written before the job is queued (BE-1)', () => {
        test('a fill-in-blank submit writes its attempt as grading before the job is queued', async () => {
            // Arrange
            await prisma.vocabTrainerAttempt.delete({ where: { trainerId } });
            let seenAtQueue: { gradingStatus: string } | null = null;
            fibProducer.evaluateAnswers.mockImplementationOnce(async () => {
                seenAtQueue = await attemptRowOrNull();
                return { jobId: 'bull-fib' };
            });

            // Act
            await submitFillInBlank();

            // Assert
            expect(seenAtQueue).toEqual(expect.objectContaining({ gradingStatus: 'grading' }));
            expect(await attemptRow()).toEqual(expect.objectContaining({ kind: 'fill-in-blank', countsAsAttempt: true, gradingStatus: 'grading', regradeCount: 0 }));
        });

        test('a queue failure on a new submit removes its attempt and releases the lock', async () => {
            // Arrange
            await prisma.vocabTrainerAttempt.delete({ where: { trainerId } });
            fibProducer.evaluateAnswers.mockRejectedValueOnce(new Error('queue down'));

            // Act & Assert
            await expect(submitFillInBlank()).rejects.toThrow('queue down');
            expect(await attemptRowOrNull()).toBeNull();
            expect(await lock.getActiveJob(owner.id)).toBeNull();
        });

        test('a queue failure on a resubmit puts the previous submit back as it was', async () => {
            // Arrange: the seeded row is the previous submit (grading failed, no regrade used)
            fibProducer.evaluateAnswers.mockRejectedValueOnce(new Error('queue down'));

            // Act & Assert
            await expect(submitFillInBlank()).rejects.toThrow('queue down');
            expect(await attemptRow()).toEqual(expect.objectContaining({ gradingStatus: 'grading_failed', regradeCount: 0, submittedAt: new Date(SUBMITTED_AT) }));
        });
    });

    describe('audio grading writes (BE-2, BE-4, BE-6)', () => {
        test('a failed write keeps the old result and leaves the attempt grading', async () => {
            // Arrange
            await makeAudioAttempt();
            await oldResult();
            const spy = jest.spyOn(repository, 'createVocabTrainerResult').mockRejectedValueOnce(new Error('write failed'));
            const job = await audioJob();

            try {
                // Act & Assert
                await expect(audioProcessor().processAudioEvaluation(job as never)).rejects.toThrow('write failed');
            } finally {
                spy.mockRestore();
            }

            // The delete ran inside the same transaction as the failed create, so Prisma rolled it back.
            expect((await prisma.vocabTrainerResult.findMany({ where: { vocabTrainerId: trainerId } })).map((row) => row.userSelected)).toEqual(['old']);
            expect((await attemptRow()).gradingStatus).toBe('grading');
            expect(await lock.getActiveJob(owner.id)).not.toBeNull();
        });

        test('a graded audio submit replaces the result and marks the attempt graded in one transaction', async () => {
            // Arrange
            await makeAudioAttempt();
            await oldResult();
            const job = await audioJob();

            // Act
            const result = await audioProcessor().processAudioEvaluation(job as never);

            // Assert
            expect(result).toEqual({ transcript: 'transcript', markdownReport: '# report' });
            expect((await prisma.vocabTrainerResult.findMany({ where: { vocabTrainerId: trainerId } })).map((row) => row.userSelected)).toEqual(['transcript']);
            expect((await attemptRow()).gradingStatus).toBe('graded');
            expect(await lock.getActiveJob(owner.id)).toBeNull();
        });

        test('a superseded audio job writes nothing and does not call the AI', async () => {
            // Arrange
            await makeAudioAttempt({ submittedAt: LATER_SUBMIT_AT });
            const job = await audioJob();

            // Act
            const result = await audioProcessor().processAudioEvaluation(job as never);

            // Assert
            expect(result).toEqual({ superseded: true });
            expect(aiService.downloadAudioFromCloudinary).not.toHaveBeenCalled();
            expect(await prisma.vocabTrainerResult.count({ where: { vocabTrainerId: trainerId } })).toBe(0);
            expect((await attemptRow()).gradingStatus).toBe('grading');
        });
    });
});
