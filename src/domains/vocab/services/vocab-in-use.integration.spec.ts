import { LanguageFolderInUseException } from '@/domains/catalog/language-folder/exceptions';
import { LanguageFolderRepository } from '@/domains/catalog/language-folder/repositories/language-folder.repository';
import { LanguageFolderService } from '@/domains/catalog/language-folder/services/language-folder.service';
import { PrismaService } from '@/shared/services/prisma.service';
import { TrainerMode } from '@prisma/client';
import { VocabInUseException } from '../exceptions';
import { VocabRepository } from '../repositories/vocab.repository';
import { VocabService } from './vocab.service';

// Runs against a real Postgres (the foreign key that blocks the delete cannot be mocked):
//   FSRS_TEST_DATABASE_URL=postgresql://admin:admin@localhost:5433/vocab_fsrs_test?schema=public pnpm test vocab-in-use.integration
const databaseUrl = process.env.FSRS_TEST_DATABASE_URL;
const describeWithDb = databaseUrl ? describe : describe.skip;

// Only the cache calls the delete path can reach; nothing is cached in these tests.
const redis = {
    jsonGet: jest.fn().mockResolvedValue(null),
    jsonSet: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
    clear: jest.fn().mockResolvedValue(undefined),
} as never;
const unused = {} as never;

describeWithDb('vocab and folder delete while a word is in a trainer (real Postgres)', () => {
    let prisma: PrismaService;
    let vocabService: VocabService;
    let folderService: LanguageFolderService;
    let userId: string;
    let folderId: string;
    let trainerId: string;
    let inTrainer: string;
    let notInTrainer: string;

    beforeAll(async () => {
        prisma = new PrismaService({ datasources: { db: { url: databaseUrl } } });
        vocabService = new VocabService(new VocabRepository(prisma, redis), unused, unused, unused, unused, unused, unused, unused, redis, unused);
        folderService = new LanguageFolderService(new LanguageFolderRepository(prisma, redis), unused);
        await prisma.$connect();
    });

    afterAll(async () => {
        await prisma.user.deleteMany({ where: { email: { startsWith: 'vocab-in-use-spec' } } });
        await prisma.$disconnect();
    });

    beforeEach(async () => {
        await prisma.user.deleteMany({ where: { email: { startsWith: 'vocab-in-use-spec' } } });
        await prisma.language.upsert({ where: { code: 'en' }, update: {}, create: { code: 'en', name: 'English' } });
        await prisma.language.upsert({ where: { code: 'vi' }, update: {}, create: { code: 'vi', name: 'Vietnamese' } });

        const user = await prisma.user.create({ data: { email: `vocab-in-use-spec-${Date.now()}@example.com`, firstName: 'A', lastName: 'B' } });
        userId = user.id;
        const folder = await prisma.languageFolder.create({ data: { name: 'Fruit', folderColor: '#000', userId, sourceLanguageCode: 'en', targetLanguageCode: 'vi' } });
        folderId = folder.id;

        inTrainer = (await prisma.vocab.create({ data: { textSource: 'apple', sourceLanguageCode: 'en', targetLanguageCode: 'vi', userId, languageFolderId: folderId } })).id;
        notInTrainer = (await prisma.vocab.create({ data: { textSource: 'river', sourceLanguageCode: 'en', targetLanguageCode: 'vi', userId, languageFolderId: folderId } })).id;

        const trainer = await prisma.vocabTrainer.create({ data: { name: 'Exam words', status: 'PENDING', mode: TrainerMode.CLASSIC, questionType: 'FLIP_CARD', userId } });
        trainerId = trainer.id;
        await prisma.vocabTrainerWord.create({ data: { vocabTrainerId: trainerId, vocabId: inTrainer } });
    });

    test('single delete of a word in a trainer is refused and the word stays', async () => {
        // Act + Assert
        await expect(vocabService.delete(inTrainer, userId)).rejects.toBeInstanceOf(VocabInUseException);
        expect(await prisma.vocab.findUnique({ where: { id: inTrainer } })).not.toBeNull();
        expect(await prisma.vocabTrainerWord.count({ where: { vocabTrainerId: trainerId, vocabId: inTrainer } })).toBe(1);
    });

    test('bulk delete with one blocked word deletes nothing, including the other word', async () => {
        // Act + Assert
        await expect(vocabService.deleteBulk({ ids: [notInTrainer, inTrainer] }, userId)).rejects.toBeInstanceOf(VocabInUseException);
        expect(await prisma.vocab.findUnique({ where: { id: notInTrainer } })).not.toBeNull();
        expect(await prisma.vocab.findUnique({ where: { id: inTrainer } })).not.toBeNull();
    });

    test('deleting the folder of a word in a trainer is refused and nothing in it is deleted', async () => {
        // Act + Assert
        await expect(folderService.delete(folderId, userId)).rejects.toBeInstanceOf(LanguageFolderInUseException);
        expect(await prisma.languageFolder.findUnique({ where: { id: folderId } })).not.toBeNull();
        expect(await prisma.vocab.count({ where: { languageFolderId: folderId } })).toBe(2);
    });
});
