import type { PrismaService } from '@/shared';
import type { RedisService } from '@/shared/services/redis.service';
import { RedisPrefix } from '@/shared/utils/redis-key.util';
import { Prisma } from '@prisma/client';
import { LanguageRepository } from './language.repository';

const LANGUAGE = { id: 'lang-vi', code: 'vi', name: 'Vietnamese' };

const createRepository = () => {
    const tx = {
        language: { findUnique: jest.fn(), delete: jest.fn() },
        vocab: { count: jest.fn().mockResolvedValue(0) },
        languageFolder: { count: jest.fn().mockResolvedValue(0) },
    };
    const redis = { del: jest.fn().mockResolvedValue(1) };
    const repository = new LanguageRepository({} as PrismaService, redis as unknown as RedisService);
    const inTransaction = jest.spyOn(repository, 'inTransaction').mockImplementation(async (fn) => fn(tx as unknown as Prisma.TransactionClient));

    return { repository, tx, redis, inTransaction };
};

describe('LanguageRepository.deleteIfUnused', () => {
    it('returns missing and deletes nothing when the language is already gone', async () => {
        const { repository, tx, redis } = createRepository();
        tx.language.findUnique.mockResolvedValue(null);

        await expect(repository.deleteIfUnused('lang-vi')).resolves.toEqual({ status: 'missing' });

        expect(tx.language.delete).not.toHaveBeenCalled();
        expect(redis.del).not.toHaveBeenCalled();
    });

    it('counts usage on the source and the target code in both tables', async () => {
        const { repository, tx } = createRepository();
        tx.language.findUnique.mockResolvedValue(LANGUAGE);

        await repository.deleteIfUnused('lang-vi');

        const usesCode = { OR: [{ sourceLanguageCode: 'vi' }, { targetLanguageCode: 'vi' }] };
        expect(tx.vocab.count).toHaveBeenCalledWith({ where: usesCode });
        expect(tx.languageFolder.count).toHaveBeenCalledWith({ where: usesCode });
    });

    it('refuses to delete and reports the counts while a vocab or folder still uses the code', async () => {
        const { repository, tx, redis } = createRepository();
        tx.language.findUnique.mockResolvedValue(LANGUAGE);
        tx.vocab.count.mockResolvedValue(2);
        tx.languageFolder.count.mockResolvedValue(1);

        await expect(repository.deleteIfUnused('lang-vi')).resolves.toEqual({ status: 'in-use', usage: { vocabCount: 2, folderCount: 1 } });

        expect(tx.language.delete).not.toHaveBeenCalled();
        expect(redis.del).not.toHaveBeenCalled();
    });

    it('deletes an unused language and clears its cache keys', async () => {
        const { repository, tx, redis } = createRepository();
        tx.language.findUnique.mockResolvedValue(LANGUAGE);
        tx.language.delete.mockResolvedValue(LANGUAGE);

        await expect(repository.deleteIfUnused('lang-vi')).resolves.toEqual({ status: 'deleted', language: LANGUAGE });

        expect(tx.language.delete).toHaveBeenCalledWith({ where: { id: 'lang-vi' } });
        expect(redis.del).toHaveBeenCalledWith(RedisPrefix.LANGUAGE, 'all');
        expect(redis.del).toHaveBeenCalledWith(RedisPrefix.LANGUAGE, 'id:lang-vi');
    });

    it('runs the check and the delete as a serializable transaction', async () => {
        const { repository, tx, inTransaction } = createRepository();
        tx.language.findUnique.mockResolvedValue(LANGUAGE);
        tx.language.delete.mockResolvedValue(LANGUAGE);

        await repository.deleteIfUnused('lang-vi');

        expect(inTransaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    });
});
