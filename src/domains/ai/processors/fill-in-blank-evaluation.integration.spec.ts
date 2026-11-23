import redisConfig from '@/config/redis.config';
import { RedisKeyManager, RedisPrefix } from '@/shared';
import { PrismaService } from '@/shared/services/prisma.service';
import { Prisma, TrainerStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { ReminderScheduleRepository } from '../../reminder/repositories/reminder-schedule.repository';
import { VocabTrainerReminderAfterExamService } from '../../reminder/services/vocab-trainer-reminder-after-exam.service';
import { VocabTrainerRepository } from '../../vocab-trainer/repositories';
import { VocabTrainerAttemptService } from '../../vocab-trainer/services/vocab-trainer-attempt.service';
import { AiQueueService } from '../services/ai-queue.service';
import { VocabTrainerJobLockService } from '../services/vocab-trainer-job-lock.service';
import { FillInBlankEvaluationProcessor } from './fill-in-blank-evaluation.processor';

// Runs against a real Postgres and a real Redis (the per-user AI job lock):
//   FSRS_TEST_DATABASE_URL=postgresql://admin:admin@localhost:5433/vocab_fsrs_test?schema=public pnpm test fill-in-blank-evaluation.integration
const databaseUrl = process.env.FSRS_TEST_DATABASE_URL;
const describeWithDb = databaseUrl ? describe : describe.skip;
const { url: redisUrl } = redisConfig();

const SPEC_EMAIL = 'ai-count-spec';
const SUBMITTED_AT = '2026-11-23T10:00:00.000Z';

const writeConflict = () => new Prisma.PrismaClientKnownRequestError('Transaction failed due to a write conflict or a deadlock.', { code: 'P2034', clientVersion: '6.11.1' });

describeWithDb('Fill-in-blank evaluation counts one Pass (real Postgres and Redis)', () => {
    let prisma: PrismaService;
    let redis: Redis;
    let lock: VocabTrainerJobLockService;
    let processor: FillInBlankEvaluationProcessor;
    let attempt: VocabTrainerAttemptService;
    let aiService: { evaluateAllFillInBlankAnswers: jest.Mock };
    let gateway: { emitFillInBlankEvaluationProgress: jest.Mock };
    let user: { id: string; email: string; firstName: string; lastName: string };
    let trainerId: string;
    let words: string[];
    let lockToken: string;
    let jobId: string;

    const logger = { error: jest.fn(), warn: jest.fn(), info: jest.fn() };

    const correctAnswers = () => words.map(() => ({ isCorrect: true, explanation: 'ok' }));

    const jobFor = (data: Record<string, unknown> = {}) => ({
        id: jobId,
        data: {
            vocabTrainerId: trainerId,
            evaluations: words.map((vocabId) => ({ vocab: {}, userAnswer: 'a', systemAnswer: 'b', questionType: 'textSource', vocabId })),
            answerSubmissions: words.map(() => ({ userAnswer: 'a', systemAnswer: 'b' })),
            userId: user.id,
            lockToken,
            countsAsAttempt: true,
            submittedAt: SUBMITTED_AT,
            ...data,
        },
        attemptsMade: 0,
        opts: { attempts: 3 },
        timestamp: 0,
        discard: jest.fn(),
    });

    const trainerRow = async () => prisma.vocabTrainer.findUniqueOrThrow({ where: { id: trainerId } });
    const attemptRow = async () => prisma.vocabTrainerAttempt.findUniqueOrThrow({ where: { trainerId } });
    const recordSubmit = async (gradingStatus: string, submittedAt = new Date(SUBMITTED_AT)) =>
        prisma.vocabTrainerAttempt.create({
            data: { trainerId, userId: user.id, kind: 'fill-in-blank', submittedAt, countsAsAttempt: true, gradingStatus, regradeCount: 0, answersSnapshot: {} },
        });

    beforeAll(async () => {
        prisma = new PrismaService({ datasources: { db: { url: databaseUrl } } });
        redis = new Redis(redisUrl);
        await prisma.$connect();

        lock = new VocabTrainerJobLockService({ client: redis } as never, logger as never);
        const trainerRepository = new VocabTrainerRepository(prisma);
        const reminderSchedules = new ReminderScheduleRepository(prisma);
        const reminderAfterExam = new VocabTrainerReminderAfterExamService();
        attempt = new VocabTrainerAttemptService(
            trainerRepository,
            reminderAfterExam,
            { hideTrainerBells: jest.fn().mockResolvedValue(undefined) } as never,
            { create: jest.fn().mockResolvedValue({ id: 'n1' }) } as never,
            logger as never,
            reminderSchedules,
        );
        aiService = { evaluateAllFillInBlankAnswers: jest.fn() };
        gateway = { emitFillInBlankEvaluationProgress: jest.fn() };
        processor = new FillInBlankEvaluationProcessor(
            logger as never,
            aiService as never,
            lock,
            gateway as never,
            trainerRepository,
            { findById: (id: string) => ({ id, email: user.email, firstName: user.firstName, lastName: user.lastName }) } as never,
            { updateMastery: jest.fn().mockResolvedValue(undefined) } as never,
            attempt,
            { notifyGraded: jest.fn(), notifyFailed: jest.fn() } as never,
        );
    });

    afterAll(async () => {
        await prisma.user.deleteMany({ where: { email: { startsWith: SPEC_EMAIL } } });
        await prisma.$disconnect();
        redis.disconnect();
    });

    beforeEach(async () => {
        jest.clearAllMocks();
        await prisma.user.deleteMany({ where: { email: { startsWith: SPEC_EMAIL } } });
        await prisma.language.upsert({ where: { code: 'en' }, update: {}, create: { code: 'en', name: 'English' } });
        await prisma.language.upsert({ where: { code: 'vi' }, update: {}, create: { code: 'vi', name: 'Vietnamese' } });

        const created = await prisma.user.create({ data: { email: `${SPEC_EMAIL}-${randomUUID()}@example.com`, firstName: 'Ada', lastName: 'Lovelace' } });
        user = { id: created.id, email: created.email, firstName: created.firstName, lastName: created.lastName };
        const folder = await prisma.languageFolder.create({ data: { name: 'f', folderColor: '#000', userId: user.id, sourceLanguageCode: 'en', targetLanguageCode: 'vi' } });
        words = [];
        for (const textSource of ['one', 'two', 'three']) {
            const vocab = await prisma.vocab.create({
                data: {
                    textSource,
                    sourceLanguageCode: 'en',
                    targetLanguageCode: 'vi',
                    userId: user.id,
                    languageFolderId: folder.id,
                    textTargets: { create: [{ textTarget: `${textSource}-vi` }] },
                },
            });
            words.push(vocab.id);
        }
        const trainer = await prisma.vocabTrainer.create({
            data: { name: 'Fill in', status: 'PENDING', questionType: 'FILL_IN_THE_BLANK', reminderRepeat: 0, reminderMaxRepeat: 6, reminderSpacingDays: 2, userId: user.id },
        });
        trainerId = trainer.id;
        jobId = randomUUID();
        const acquired = await lock.acquireOrGetActive(user.id, trainerId, 'fill-in-blank-evaluation', 'fill-in-blank', jobId);
        if (!acquired.acquired) {
            throw new Error('the spec could not take the job lock');
        }
        lockToken = acquired.job.lockToken;
    });

    afterEach(async () => {
        await redis.del(RedisKeyManager.generateKey(RedisPrefix.LOCK, 'vocab-trainer', 'user', user.id));
    });

    test('a retry after the commit does not count the same attempt twice', async () => {
        // Arrange: the first run commits, then the socket emit fails, so Bull retries the job with the lock still held
        aiService.evaluateAllFillInBlankAnswers.mockResolvedValue(correctAnswers());
        let failedOnce = false;
        gateway.emitFillInBlankEvaluationProgress.mockImplementation((_userId: string, _jobId: string, status: string) => {
            if (status === 'completed' && !failedOnce) {
                failedOnce = true;
                throw new Error('socket down');
            }
        });

        // Act
        await expect(processor.processFillInBlankEvaluation(jobFor() as never)).rejects.toThrow('socket down');
        await processor.processFillInBlankEvaluation(jobFor() as never);

        // Assert
        expect((await trainerRow()).reminderRepeat).toBe(1);
        expect(aiService.evaluateAllFillInBlankAnswers).toHaveBeenCalledTimes(1);
        expect(await prisma.vocabTrainerResult.count({ where: { vocabTrainerId: trainerId } })).toBe(words.length);
        expect(await prisma.reminderSchedule.count({ where: { entityId: trainerId, status: 'PENDING' } })).toBe(1);
    });

    test('a trainer deleted while the AI runs: nothing is written, the job completes and the lock is released', async () => {
        // Arrange
        aiService.evaluateAllFillInBlankAnswers.mockImplementation(async () => {
            await prisma.vocabTrainer.delete({ where: { id: trainerId } });
            return correctAnswers();
        });

        // Act
        const result = await processor.processFillInBlankEvaluation(jobFor() as never);

        // Assert
        expect(result).toEqual(expect.objectContaining({ trainerDeleted: true }));
        expect(await prisma.vocabTrainerResult.count({ where: { vocabTrainerId: trainerId } })).toBe(0);
        expect(await prisma.reminderSchedule.count({ where: { entityId: trainerId } })).toBe(0);
        expect(await lock.getActiveJob(user.id)).toBeNull();
    });

    test('a trainer deleted before the job runs: no AI call and no error', async () => {
        // Arrange
        await prisma.vocabTrainer.delete({ where: { id: trainerId } });

        // Act
        const result = await processor.processFillInBlankEvaluation(jobFor() as never);

        // Assert
        expect(result).toEqual({ results: [], trainerDeleted: true });
        expect(aiService.evaluateAllFillInBlankAnswers).not.toHaveBeenCalled();
        expect(await lock.getActiveJob(user.id)).toBeNull();
    });

    test('a write conflict thrown after the attempt is written rolls it back, and the retry applies it once', async () => {
        // Arrange: results exist, so the attempt's writes replace them
        aiService.evaluateAllFillInBlankAnswers.mockResolvedValue(correctAnswers());
        await prisma.vocabTrainerResult.createMany({
            data: words.map((vocabId) => ({ vocabTrainerId: trainerId, vocabId, status: TrainerStatus.FAILED, userSelected: 'seed', systemSelected: 'seed' })),
        });
        const original = attempt.applyAttemptTx.bind(attempt) as typeof attempt.applyAttemptTx;
        const spy = jest.spyOn(attempt, 'applyAttemptTx').mockImplementationOnce(async (tx, input) => {
            await original(tx, input);
            // The conflict surfaces after every write of the attempt. The callback fails, so Prisma rolls the attempt back.
            throw writeConflict();
        });

        try {
            // Act
            await processor.processFillInBlankEvaluation(jobFor() as never);

            // Assert
            expect(spy).toHaveBeenCalledTimes(2);
            expect(aiService.evaluateAllFillInBlankAnswers).toHaveBeenCalledTimes(1);
            expect((await trainerRow()).reminderRepeat).toBe(1);
            expect(await prisma.vocabTrainerResult.count({ where: { vocabTrainerId: trainerId } })).toBe(words.length);
            expect(await prisma.vocabTrainerResult.count({ where: { vocabTrainerId: trainerId, userSelected: 'seed' } })).toBe(0);
            expect(await prisma.reminderSchedule.count({ where: { entityId: trainerId, status: 'PENDING' } })).toBe(1);
        } finally {
            spy.mockRestore();
        }
    });

    test('applies the counting decision stored in the job, even when the trainer would count it differently now', async () => {
        // Arrange
        aiService.evaluateAllFillInBlankAnswers.mockResolvedValue(correctAnswers());

        // Act: the job was queued as a repeat (not counted)
        await processor.processFillInBlankEvaluation(jobFor({ countsAsAttempt: false }) as never);

        // Assert
        const trainer = await trainerRow();
        expect(trainer.reminderRepeat).toBe(0);
        expect(trainer.lastExamSubmittedAt?.toISOString()).toBe(SUBMITTED_AT);
        expect(await prisma.reminderSchedule.count({ where: { entityId: trainerId } })).toBe(0);
    });

    test('a graded submit is marked graded in the same transaction as its results (BE-4)', async () => {
        // Arrange
        aiService.evaluateAllFillInBlankAnswers.mockResolvedValue(correctAnswers());
        await recordSubmit('grading');

        // Act
        await processor.processFillInBlankEvaluation(jobFor() as never);

        // Assert
        expect((await attemptRow()).gradingStatus).toBe('graded');
        expect(await prisma.vocabTrainerResult.count({ where: { vocabTrainerId: trainerId } })).toBe(words.length);
    });

    test('the final failure marks the grading as failed and releases the lock (BE-4)', async () => {
        // Arrange
        aiService.evaluateAllFillInBlankAnswers.mockRejectedValue(new Error('provider down'));
        await recordSubmit('grading');

        // Act
        await expect(processor.processFillInBlankEvaluation({ ...jobFor(), attemptsMade: 2 } as never)).rejects.toThrow('provider down');

        // Assert
        expect((await attemptRow()).gradingStatus).toBe('grading_failed');
        expect((await trainerRow()).reminderRepeat).toBe(0);
        expect(await lock.getActiveJob(user.id)).toBeNull();
    });

    test('a job for a submit that a newer submit replaced is skipped: no AI call, no result, no Pass (BE-6)', async () => {
        // Arrange
        await recordSubmit('grading', new Date('2026-11-23T11:00:00.000Z'));

        // Act
        const result = await processor.processFillInBlankEvaluation(jobFor() as never);

        // Assert
        expect(result).toEqual({ results: [], superseded: true });
        expect(aiService.evaluateAllFillInBlankAnswers).not.toHaveBeenCalled();
        expect(await prisma.vocabTrainerResult.count({ where: { vocabTrainerId: trainerId } })).toBe(0);
        expect((await trainerRow()).reminderRepeat).toBe(0);
        expect(await lock.getActiveJob(user.id)).toBeNull();
    });

    test('a newer submit that lands while the AI runs stops the older job before it writes (BE-6)', async () => {
        // Arrange
        await recordSubmit('grading');
        aiService.evaluateAllFillInBlankAnswers.mockImplementation(async () => {
            await prisma.vocabTrainerAttempt.update({ where: { trainerId }, data: { submittedAt: new Date('2026-11-23T11:00:00.000Z') } });
            return correctAnswers();
        });

        // Act
        const result = await processor.processFillInBlankEvaluation(jobFor() as never);

        // Assert
        expect(result).toEqual({ results: [], superseded: true });
        expect(await prisma.vocabTrainerResult.count({ where: { vocabTrainerId: trainerId } })).toBe(0);
        expect((await trainerRow()).reminderRepeat).toBe(0);
        expect((await attemptRow()).gradingStatus).toBe('grading');
    });
});

describeWithDb('AI queue joins a running evaluation (real Redis)', () => {
    let redis: Redis;
    let lock: VocabTrainerJobLockService;
    let queue: AiQueueService;
    let producer: { evaluateAnswers: jest.Mock };
    const logger = { error: jest.fn(), warn: jest.fn(), info: jest.fn() };
    const unused = {} as never;
    const userId = `ai-count-queue-${randomUUID()}`;

    beforeAll(() => {
        redis = new Redis(redisUrl);
        lock = new VocabTrainerJobLockService({ client: redis } as never, logger as never);
        producer = { evaluateAnswers: jest.fn().mockResolvedValue({ jobId: 'first-job' }) };
        queue = new AiQueueService(unused, unused, unused, producer as never, lock);
    });

    afterAll(async () => {
        await redis.del(RedisKeyManager.generateKey(RedisPrefix.LOCK, 'vocab-trainer', 'user', userId));
        redis.disconnect();
    });

    test('a second submit joins the running job and never decides whether it counts', async () => {
        // Arrange
        const recordAttempt = jest.fn().mockResolvedValue(jest.fn().mockResolvedValue(undefined));
        const params = (decideAttempt: jest.Mock) =>
            ({
                userId,
                vocabTrainerId: 'trainer-join',
                jobType: 'fill-in-blank',
                queueName: 'fill-in-blank-evaluation',
                evaluations: [],
                answerSubmissions: [],
                decideAttempt,
                recordAttempt,
            }) as never;
        const first = jest.fn().mockResolvedValue({ countsAsAttempt: true, submittedAt: SUBMITTED_AT });
        const second = jest.fn().mockResolvedValue({ countsAsAttempt: true, submittedAt: SUBMITTED_AT });

        // Act
        const started = await queue.queueFillInBlankEvaluation(params(first));
        const joined = await queue.queueFillInBlankEvaluation(params(second));

        // Assert
        expect(started.jobId).toBeDefined();
        expect(joined.activeJob).toBeDefined();
        expect(first).toHaveBeenCalledTimes(1);
        expect(second).not.toHaveBeenCalled();
        // Only the submit that started the job writes its attempt row (BE-1); the joined submit writes nothing.
        expect(recordAttempt).toHaveBeenCalledTimes(1);
        expect(producer.evaluateAnswers).toHaveBeenCalledTimes(1);
        expect(await queue.getActiveJobForTrainer(userId, 'trainer-join')).not.toBeNull();
        await lock.releaseIfOwned(userId, (await lock.getActiveJob(userId))?.lockToken ?? '');
    });
});
