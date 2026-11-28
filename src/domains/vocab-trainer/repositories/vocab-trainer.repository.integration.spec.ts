import { PrismaService } from '@/shared/services/prisma.service';
import { TrainerMode, TrainerStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { VocabTrainerRepository } from './vocab-trainer.repository';

// Runs against a real Postgres: the owner check is a database filter, so only a real query proves it:
//   FSRS_TEST_DATABASE_URL=postgresql://admin:admin@localhost:5433/vocab_fsrs_test?schema=public pnpm test vocab-trainer.repository.integration
const databaseUrl = process.env.FSRS_TEST_DATABASE_URL;
const describeWithDb = databaseUrl ? describe : describe.skip;

const SPEC_EMAIL = 'vocab-trainer-repo-spec';

describeWithDb('VocabTrainerRepository.findVocabTrainerByIdForUserMinimal (real Postgres)', () => {
    let prisma: PrismaService;
    let repository: VocabTrainerRepository;
    let owner: { id: string };
    let other: { id: string };
    let trainerId: string;

    const createUser = async (label: string) => prisma.user.create({ data: { email: `${SPEC_EMAIL}-${label}-${randomUUID()}@example.com`, firstName: 'Spec', lastName: label } });

    beforeAll(async () => {
        prisma = new PrismaService({ datasources: { db: { url: databaseUrl } } });
        await prisma.$connect();
        repository = new VocabTrainerRepository(prisma);
    });

    afterAll(async () => {
        await prisma.user.deleteMany({ where: { email: { startsWith: SPEC_EMAIL } } });
        await prisma.$disconnect();
    });

    beforeEach(async () => {
        await prisma.user.deleteMany({ where: { email: { startsWith: SPEC_EMAIL } } });
        owner = await createUser('owner');
        other = await createUser('other');
        const trainer = await prisma.vocabTrainer.create({
            data: { name: 'Animals', status: TrainerStatus.PENDING, questionType: 'MULTIPLE_CHOICE', mode: TrainerMode.CLASSIC, reminderRepeat: 0, userId: owner.id },
        });
        trainerId = trainer.id;
    });

    it('returns the trainer for its owner', async () => {
        // Act
        const found = await repository.findVocabTrainerByIdForUserMinimal(trainerId, owner.id);

        // Assert
        expect(found?.id).toBe(trainerId);
    });

    it('returns null for another user, although the trainer exists', async () => {
        // Act
        const found = await repository.findVocabTrainerByIdForUserMinimal(trainerId, other.id);

        // Assert
        expect(found).toBeNull();
    });

    it('returns null for a missing trainer', async () => {
        // Act
        const found = await repository.findVocabTrainerByIdForUserMinimal(randomUUID(), owner.id);

        // Assert
        expect(found).toBeNull();
    });
});
