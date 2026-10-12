import { Language } from '@prisma/client';
import { LanguageCodeImmutableException, LanguageInUseException, LanguageNotFoundException } from '../exceptions';
import { LanguageRepository } from '../repositories';
import { LanguageService } from './language.service';

const makeLanguage = (overrides: Partial<Language> = {}): Language =>
    ({
        id: 'lang-vi',
        code: 'vi',
        name: 'Vietnamese',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        ...overrides,
    }) as Language;

const makeRepository = (overrides: Partial<Record<keyof LanguageRepository, jest.Mock>> = {}) => ({
    findById: jest.fn().mockResolvedValue(makeLanguage()),
    update: jest.fn().mockResolvedValue(makeLanguage({ name: 'Tiếng Việt' })),
    deleteIfUnused: jest.fn().mockResolvedValue({ status: 'deleted', language: makeLanguage() }),
    findAllUncached: jest.fn().mockResolvedValue([]),
    findVocabLanguagePairs: jest.fn().mockResolvedValue([]),
    findFolderLanguagePairs: jest.fn().mockResolvedValue([]),
    ...overrides,
});

const createService = (repository: ReturnType<typeof makeRepository>) => new LanguageService(repository as unknown as LanguageRepository);

describe('LanguageService.delete', () => {
    it('refuses to delete an in-use language and reports the counts', async () => {
        const repository = makeRepository({
            deleteIfUnused: jest.fn().mockResolvedValue({ status: 'in-use', usage: { vocabCount: 3, folderCount: 1 } }),
        });
        const service = createService(repository);

        const error = await service.delete('lang-vi').catch((e: unknown) => e);

        expect(error).toBeInstanceOf(LanguageInUseException);
        const response = (error as LanguageInUseException).getResponse() as {
            error: string;
            details: { languageId: string; vocabCount: number; folderCount: number };
        };
        expect(response.error).toBe('LanguageInUse');
        expect(response.details).toEqual({ languageId: 'lang-vi', languageName: 'Vietnamese', vocabCount: 3, folderCount: 1 });
        expect((error as LanguageInUseException).getStatus()).toBe(409);
    });

    it('deletes an unused language and returns it', async () => {
        const repository = makeRepository();
        const service = createService(repository);

        const result = await service.delete('lang-vi');

        expect(repository.deleteIfUnused).toHaveBeenCalledWith('lang-vi');
        expect(result.code).toBe('vi');
    });

    it('returns 404 for an unknown language and never runs the delete', async () => {
        const repository = makeRepository({ findById: jest.fn().mockResolvedValue(null) });
        const service = createService(repository);

        await expect(service.delete('missing')).rejects.toBeInstanceOf(LanguageNotFoundException);
        expect(repository.deleteIfUnused).not.toHaveBeenCalled();
    });

    it('returns 404 when the language is removed between the read and the delete', async () => {
        const repository = makeRepository({ deleteIfUnused: jest.fn().mockResolvedValue({ status: 'missing' }) });
        const service = createService(repository);

        await expect(service.delete('lang-vi')).rejects.toBeInstanceOf(LanguageNotFoundException);
    });
});

describe('LanguageService.update', () => {
    it('renames a language when the code stays the same', async () => {
        const repository = makeRepository();
        const service = createService(repository);

        const result = await service.update('lang-vi', { code: 'vi', name: 'Tiếng Việt' });

        expect(repository.update).toHaveBeenCalledWith('lang-vi', { name: 'Tiếng Việt' });
        expect(result.name).toBe('Tiếng Việt');
    });

    it('refuses a code change with 400 and writes nothing', async () => {
        const repository = makeRepository();
        const service = createService(repository);

        const error = await service.update('lang-vi', { code: 'vi-VN', name: 'Vietnamese' }).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(LanguageCodeImmutableException);
        expect((error as LanguageCodeImmutableException).getStatus()).toBe(400);
        expect(repository.update).not.toHaveBeenCalled();
    });
});

describe('LanguageService.findAllForAdmin', () => {
    it('counts the vocabs and folders that use each language, each row once', async () => {
        const repository = makeRepository({
            findAllUncached: jest.fn().mockResolvedValue([makeLanguage(), makeLanguage({ id: 'lang-en', code: 'en', name: 'English' })]),
            // A vocab row en -> vi counts for both en and vi. A vi -> vi row counts once for vi, not twice.
            findVocabLanguagePairs: jest.fn().mockResolvedValue([
                { sourceLanguageCode: 'en', targetLanguageCode: 'vi', count: 2 },
                { sourceLanguageCode: 'vi', targetLanguageCode: 'vi', count: 1 },
            ]),
            findFolderLanguagePairs: jest.fn().mockResolvedValue([{ sourceLanguageCode: 'en', targetLanguageCode: 'vi', count: 1 }]),
        });
        const service = createService(repository);

        const result = await service.findAllForAdmin();

        expect(result).toEqual([expect.objectContaining({ code: 'vi', vocabCount: 3, folderCount: 1 }), expect.objectContaining({ code: 'en', vocabCount: 2, folderCount: 1 })]);
    });

    it('reports zero usage for a language nothing uses', async () => {
        const repository = makeRepository({ findAllUncached: jest.fn().mockResolvedValue([makeLanguage()]) });
        const service = createService(repository);

        const [row] = await service.findAllForAdmin();

        expect(row).toEqual(expect.objectContaining({ vocabCount: 0, folderCount: 0 }));
    });
});
