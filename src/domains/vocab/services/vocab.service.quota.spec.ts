import { Prisma } from '@prisma/client';
import { VocabService } from './vocab.service';

// The create path only touches the repositories and the quota service below, so the other collaborators are not needed.
const unused = {} as never;

const input = { textSource: 'cat', sourceLanguageCode: 'en', targetLanguageCode: 'vi', languageFolderId: 'f1', textTargets: [{ textTarget: 'mèo' }] };

const duplicateError = () => new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: '6.11.1' });

describe('VocabService.create and the daily vocab slot', () => {
    let repository: {
        findLanguageFolderById: jest.Mock;
        inTransaction: jest.Mock;
        clearListCaches: jest.Mock;
    };
    let planQuota: { assertCreationQuota: jest.Mock; releaseVocabDailySlot: jest.Mock };
    let service: VocabService;

    beforeEach(() => {
        repository = {
            findLanguageFolderById: jest.fn().mockResolvedValue({ id: 'f1' }),
            inTransaction: jest.fn().mockResolvedValue({ createdVocab: { id: 'v1' }, backfillIds: [] }),
            clearListCaches: jest.fn().mockResolvedValue(undefined),
        };
        planQuota = {
            assertCreationQuota: jest.fn().mockResolvedValue(undefined),
            releaseVocabDailySlot: jest.fn().mockResolvedValue(undefined),
        };
        const vocabRelatedWordRepository = { clearCacheByVocabIds: jest.fn().mockResolvedValue(undefined) };
        service = new VocabService(repository as never, unused, unused, planQuota as never, unused, vocabRelatedWordRepository as never, unused, unused, unused, unused);
        jest.spyOn(service as never, 'buildResponse' as never).mockResolvedValue({ id: 'v1' } as never);
    });

    test('takes a daily slot before the write', async () => {
        // Act
        await service.create(input, 'u1', 'MEMBER' as never);

        // Assert
        expect(planQuota.assertCreationQuota).toHaveBeenCalledWith('u1', 'MEMBER', 'vocab');
    });

    test('gives the slot back when the write fails', async () => {
        // Arrange
        repository.inTransaction.mockRejectedValue(duplicateError());

        // Act + Assert
        await expect(service.create(input, 'u1', 'MEMBER' as never)).rejects.toThrow();
        expect(planQuota.releaseVocabDailySlot).toHaveBeenCalledWith('u1', 'MEMBER');
    });

    test('keeps the slot when the word is saved', async () => {
        // Act
        await service.create(input, 'u1', 'MEMBER' as never);

        // Assert
        expect(planQuota.releaseVocabDailySlot).not.toHaveBeenCalled();
    });

    test('does not write or release when the quota check refuses the create', async () => {
        // Arrange
        planQuota.assertCreationQuota.mockRejectedValue(new Error('Daily vocab limit reached'));

        // Act + Assert
        await expect(service.create(input, 'u1', 'MEMBER' as never)).rejects.toThrow('Daily vocab limit reached');
        expect(repository.inTransaction).not.toHaveBeenCalled();
        expect(planQuota.releaseVocabDailySlot).not.toHaveBeenCalled();
    });

    test('takes and gives back nothing when no role is given', async () => {
        // Arrange
        repository.inTransaction.mockRejectedValue(duplicateError());

        // Act
        await expect(service.create(input, 'u1')).rejects.toThrow();

        // Assert
        expect(planQuota.assertCreationQuota).not.toHaveBeenCalled();
        expect(planQuota.releaseVocabDailySlot).not.toHaveBeenCalled();
    });
});
