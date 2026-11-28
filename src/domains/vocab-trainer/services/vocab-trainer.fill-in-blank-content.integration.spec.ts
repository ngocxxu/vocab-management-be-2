import redisConfig from '@/config/redis.config';
import { RedisKeyManager, RedisPrefix } from '@/shared';
import { PrismaService } from '@/shared/services/prisma.service';
import { QuestionType } from '@prisma/client';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { FillInBlankEvaluationProcessor } from '../../ai/processors/fill-in-blank-evaluation.processor';
import { AiQueueService } from '../../ai/services/ai-queue.service';
import { VocabTrainerJobLockService } from '../../ai/services/vocab-trainer-job-lock.service';
import { ReminderScheduleRepository } from '../../reminder/repositories/reminder-schedule.repository';
import { VocabTrainerReminderAfterExamService } from '../../reminder/services/vocab-trainer-reminder-after-exam.service';
import { FsrsRepository } from '../../vocab/repositories/fsrs.repository';
import { VocabTrainerResultDto } from '../dto/vocab-trainer-result.dto';
import { VocabTrainerRepository } from '../repositories';
import { VocabTrainerAttemptService } from './vocab-trainer-attempt.service';
import { VocabTrainerReminderService } from './vocab-trainer-reminder.service';
import { VocabTrainerService } from './vocab-trainer.service';

// Runs against a real Postgres and a real Redis (the per-user AI job lock):
//   FSRS_TEST_DATABASE_URL=postgresql://admin:admin@localhost:5433/vocab_fsrs_test?schema=public pnpm test vocab-trainer.fill-in-blank-content.integration
const databaseUrl = process.env.FSRS_TEST_DATABASE_URL;
const describeWithDb = databaseUrl ? describe : describe.skip;
const { url: redisUrl } = redisConfig();

const SPEC_EMAIL = 'fib-content-spec';

type QueuedJob = { jobId: string };

describeWithDb('Fill-in-blank question text is stored for display only (#17, real Postgres and Redis)', () => {
    let prisma: PrismaService;
    let redis: Redis;
    let trainerRepository: VocabTrainerRepository;
    let service: VocabTrainerService;
    let processor: FillInBlankEvaluationProcessor;
    let producer: { evaluateAnswers: jest.Mock };
    let aiService: { evaluateAllFillInBlankAnswers: jest.Mock };
    let user: { id: string; email: string; firstName: string; lastName: string };
    let trainerId: string;

    const logger = { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() };
    const unused = {} as never;

    /** Submits through the real service. Returns the job the queue sent to the producer. */
    const submit = async (wordTestInputs: Array<Record<string, unknown>>): Promise<QueuedJob & Record<string, unknown>> => {
        await service.submitFillInBlank(trainerId, { questionType: QuestionType.FILL_IN_THE_BLANK, countTime: 120, wordTestInputs } as never, user as never);
        return producer.evaluateAnswers.mock.calls[0][0] as QueuedJob & Record<string, unknown>;
    };

    /** Runs the real processor on the queued job, as Bull would. */
    const grade = async (job: QueuedJob) =>
        processor.processFillInBlankEvaluation({ id: job.jobId, data: job, attemptsMade: 0, opts: { attempts: 3 }, timestamp: 0, discard: jest.fn() } as never);

    const attemptRow = async () => prisma.vocabTrainerAttempt.findUniqueOrThrow({ where: { trainerId } });

    /** The stored result rows, mapped with the same DTO the trainer read uses for `results`. */
    const storedResults = async () => (await trainerRepository.findResultsByTrainerId(trainerId)).map((stored) => new VocabTrainerResultDto(stored));

    beforeAll(async () => {
        prisma = new PrismaService({ datasources: { db: { url: databaseUrl } } });
        redis = new Redis(redisUrl);
        await prisma.$connect();

        const lock = new VocabTrainerJobLockService({ client: redis } as never, logger as never);
        producer = { evaluateAnswers: jest.fn() };
        const aiQueue = new AiQueueService(unused, unused, unused, producer as never, lock);
        trainerRepository = new VocabTrainerRepository(prisma);
        const reminderSchedules = new ReminderScheduleRepository(prisma);
        const reminderAfterExam = new VocabTrainerReminderAfterExamService();
        const reminderInApp = { hideTrainerBells: jest.fn().mockResolvedValue(undefined), hideAllTrainerBells: jest.fn().mockResolvedValue(undefined) };
        const notifications = { create: jest.fn().mockResolvedValue({ id: 'n1' }) };
        const fsrsReminder = { sync: jest.fn().mockResolvedValue(undefined), cancelForTrainer: jest.fn() };
        const attempt = new VocabTrainerAttemptService(trainerRepository, reminderAfterExam, reminderInApp as never, notifications as never, logger as never, reminderSchedules);
        const reminderSettings = new VocabTrainerReminderService(
            trainerRepository,
            reminderAfterExam,
            reminderSchedules,
            reminderInApp as never,
            fsrsReminder as never,
            logger as never,
        );
        const aiFacade = {
            queueFillInBlankEvaluation: async (params: never) => {
                const queued = await aiQueue.queueFillInBlankEvaluation(params);
                return queued;
            },
            getActiveJobForTrainer: async (userId: string, id: string) => {
                const active = await aiQueue.getActiveJobForTrainer(userId, id);
                return active;
            },
        };
        const mastery = { updateMastery: jest.fn().mockResolvedValue(undefined) };
        service = new VocabTrainerService(
            trainerRepository,
            aiFacade as never,
            mastery as never,
            logger as never,
            new FsrsRepository(prisma),
            unused,
            fsrsReminder as never,
            attempt,
            reminderSettings,
        );

        aiService = { evaluateAllFillInBlankAnswers: jest.fn() };
        processor = new FillInBlankEvaluationProcessor(
            logger as never,
            aiService as never,
            lock,
            { emitFillInBlankEvaluationProgress: jest.fn() } as never,
            trainerRepository,
            { findById: (id: string) => ({ id, email: user.email, firstName: user.firstName, lastName: user.lastName }) } as never,
            mastery as never,
            attempt,
            { notifyGraded: jest.fn(), notifyFailed: jest.fn() } as never,
        );
    });

    afterAll(async () => {
        await prisma.user.deleteMany({ where: { email: { startsWith: SPEC_EMAIL } } });
        await prisma.$disconnect();
        redis.disconnect();
    });

    afterEach(async () => {
        await redis.del(RedisKeyManager.generateKey(RedisPrefix.LOCK, 'vocab-trainer', 'user', user.id));
    });

    beforeEach(async () => {
        jest.clearAllMocks();
        await prisma.user.deleteMany({ where: { email: { startsWith: SPEC_EMAIL } } });
        await prisma.language.upsert({ where: { code: 'en' }, update: {}, create: { code: 'en', name: 'English' } });
        await prisma.language.upsert({ where: { code: 'vi' }, update: {}, create: { code: 'vi', name: 'Vietnamese' } });

        const created = await prisma.user.create({ data: { email: `${SPEC_EMAIL}-${randomUUID()}@example.com`, firstName: 'Ada', lastName: 'Lovelace' } });
        user = { id: created.id, email: created.email, firstName: created.firstName, lastName: created.lastName };
        const folder = await prisma.languageFolder.create({ data: { name: 'f', folderColor: '#000', userId: user.id, sourceLanguageCode: 'en', targetLanguageCode: 'vi' } });
        const createVocab = async (textSource: string, textTarget: string) => {
            const vocab = await prisma.vocab.create({
                data: {
                    textSource,
                    sourceLanguageCode: 'en',
                    targetLanguageCode: 'vi',
                    userId: user.id,
                    languageFolderId: folder.id,
                    textTargets: { create: [{ textTarget }] },
                },
            });
            return vocab;
        };
        const one = await createVocab('one', 'mot');
        const two = await createVocab('two', 'hai');
        const trainer = await prisma.vocabTrainer.create({
            data: { name: 'Fill in', status: 'PENDING', questionType: 'FILL_IN_THE_BLANK', reminderRepeat: 0, reminderMaxRepeat: 6, reminderSpacingDays: 2, userId: user.id },
        });
        trainerId = trainer.id;
        await prisma.vocabTrainerWord.createMany({
            data: [
                { vocabTrainerId: trainerId, vocabId: one.id },
                { vocabTrainerId: trainerId, vocabId: two.id },
            ],
        });

        producer.evaluateAnswers.mockImplementation((data: QueuedJob) => ({ jobId: data.jobId }));
    });

    test('stores the question text per question, and the stored result returns it', async () => {
        // Arrange
        aiService.evaluateAllFillInBlankAnswers.mockResolvedValue([
            { isCorrect: true, explanation: 'ok' },
            { isCorrect: false, explanation: 'no' },
        ]);

        // Act
        const job = await submit([
            { userAnswer: 'mot', systemAnswer: 'one', content: '  What is "one"?  ' },
            { userAnswer: 'hai', systemAnswer: 'two', content: 'What is "two"?' },
        ]);
        await grade(job);

        // Assert: the snapshot keeps the text next to the answers
        const stored = await attemptRow();
        expect(stored.gradingStatus).toBe('graded');
        expect(stored.answersSnapshot).toMatchObject({
            answerSubmissions: [
                { userAnswer: 'mot', systemAnswer: 'one', content: 'What is "one"?' },
                { userAnswer: 'hai', systemAnswer: 'two', content: 'What is "two"?' },
            ],
        });

        // Assert: the stored result returns the text, and the answers are unchanged
        const results = await storedResults();
        expect(results.find((result) => result.systemSelected === 'one')).toMatchObject({ userSelected: 'mot', data: { content: 'What is "one"?' } });
        expect(results.find((result) => result.systemSelected === 'two')).toMatchObject({ userSelected: 'hai', data: { content: 'What is "two"?' } });

        // Assert: the grader never receives the question text
        const graded = aiService.evaluateAllFillInBlankAnswers.mock.calls[0][0] as Array<Record<string, unknown>>;
        expect(graded.every((item) => !('content' in item))).toBe(true);
    });

    test('a submit without question text still grades, and stores null', async () => {
        // Arrange
        aiService.evaluateAllFillInBlankAnswers.mockResolvedValue([
            { isCorrect: true, explanation: 'ok' },
            { isCorrect: true, explanation: 'ok' },
        ]);

        // Act
        const job = await submit([
            { userAnswer: 'mot', systemAnswer: 'one' },
            { userAnswer: 'hai', systemAnswer: 'two' },
        ]);
        await grade(job);

        // Assert
        const stored = await attemptRow();
        expect(stored.gradingStatus).toBe('graded');
        expect(stored.answersSnapshot).toMatchObject({ answerSubmissions: [{ content: null }, { content: null }] });

        const results = await storedResults();
        expect(results).toHaveLength(2);
        expect(results.every((result) => result.data?.content === null)).toBe(true);
    });
});
