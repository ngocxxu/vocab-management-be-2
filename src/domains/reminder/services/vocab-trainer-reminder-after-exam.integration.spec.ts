import { PrismaService } from '@/shared/services/prisma.service';
import { ReminderChannel, ReminderScheduleKind, ReminderScheduleStatus, User } from '@prisma/client';
import { randomUUID } from 'crypto';
import { EEmailTemplate } from '../utils';
import { buildReminderDedupeKey } from '../utils/reminder-dedupe-key.util';
import { VocabTrainerReminderAfterExamService } from './vocab-trainer-reminder-after-exam.service';

// Runs against a real Postgres. The partial unique index on dedupe_key is what the clash relies on:
//   FSRS_TEST_DATABASE_URL=postgresql://admin:admin@localhost:5433/vocab_fsrs_test pnpm test vocab-trainer-reminder-after-exam.integration
const databaseUrl = process.env.FSRS_TEST_DATABASE_URL;
const describeWithDb = databaseUrl ? describe : describe.skip;
const SPEC_EMAIL = 'after-exam-spec';

describeWithDb('VocabTrainerReminderAfterExamService.scheduleInitialTx (real Postgres)', () => {
    let prisma: PrismaService;
    let service: VocabTrainerReminderAfterExamService;
    let user: User;

    const input = (trainerId: string) => ({
        trainerId,
        userId: user.id,
        userEmail: user.email,
        firstName: 'Ada',
        lastName: 'Lovelace',
        trainerName: 'Week 1',
        examUrl: 'https://app.example.com/exam',
        spacingDays: 2,
        reminderDisabled: false,
    });

    /** An open INITIAL reminder that holds the chain key the next reminder would take. Not terminal, so the key is not moved on. */
    const seedOpenInitial = async (trainerId: string, chainIndex: number) =>
        prisma.reminderSchedule.create({
            data: {
                dedupeKey: buildReminderDedupeKey.vocabTrainerInitial(trainerId, chainIndex),
                channel: ReminderChannel.EMAIL,
                recipient: user.email,
                template: EEmailTemplate.EXAM_REMINDER,
                payload: {},
                dueAt: new Date(),
                userId: user.id,
                entityType: 'vocab_trainer',
                entityId: trainerId,
                reminderType: ReminderScheduleKind.INITIAL,
                chainCount: chainIndex,
                status: ReminderScheduleStatus.PENDING,
            },
        });

    const initialRows = async (trainerId: string) =>
        prisma.reminderSchedule.findMany({ where: { entityType: 'vocab_trainer', entityId: trainerId, reminderType: ReminderScheduleKind.INITIAL } });

    beforeAll(async () => {
        prisma = new PrismaService({ datasources: { db: { url: databaseUrl } } });
        await prisma.$connect();
        service = new VocabTrainerReminderAfterExamService();
    });

    afterAll(async () => {
        await prisma.reminderSchedule.deleteMany({ where: { recipient: { startsWith: SPEC_EMAIL } } });
        await prisma.user.deleteMany({ where: { email: { startsWith: SPEC_EMAIL } } });
        await prisma.$disconnect();
    });

    beforeEach(async () => {
        await prisma.reminderSchedule.deleteMany({ where: { recipient: { startsWith: SPEC_EMAIL } } });
        await prisma.user.deleteMany({ where: { email: { startsWith: SPEC_EMAIL } } });
        user = await prisma.user.create({ data: { email: `${SPEC_EMAIL}-${randomUUID()}@example.com`, firstName: 'Ada', lastName: 'Lovelace' } });
    });

    test('plans the next reminder when nothing is open', async () => {
        // Arrange
        const trainerId = randomUUID();

        // Act
        await prisma.$transaction(async (tx) => service.scheduleInitialTx(tx, input(trainerId)));

        // Assert
        const rows = await initialRows(trainerId);
        expect(rows).toHaveLength(1);
        expect(rows[0]?.status).toBe(ReminderScheduleStatus.PENDING);
        expect(rows[0]?.chainCount).toBe(1);
    });

    test('a clashing reminder does not abort the transaction it runs in', async () => {
        // Arrange: an open reminder already holds the chain-1 key that the next reminder would take
        const trainerId = randomUUID();
        await seedOpenInitial(trainerId, 1);

        // Act: plan the next reminder, then run one more query in the same transaction
        const readBack = await prisma.$transaction(async (tx) => {
            await service.scheduleInitialTx(tx, input(trainerId));

            return tx.user.findUniqueOrThrow({ where: { id: user.id } });
        });

        // Assert: the clash is skipped, the transaction stays usable, and the one open reminder is still the only one
        expect(readBack.id).toBe(user.id);
        expect(await initialRows(trainerId)).toHaveLength(1);
    });
});
