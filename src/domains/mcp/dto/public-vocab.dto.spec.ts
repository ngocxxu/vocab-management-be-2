import { PublicVocabDto, VocabEntityWithDetails } from './public-vocab.dto';

const entity: VocabEntityWithDetails = {
    id: 'vocab-1',
    userId: 'owner-1',
    languageFolderId: 'folder-1',
    textSource: 'hello',
    sourceLanguageCode: 'en',
    targetLanguageCode: 'vi',
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    updatedAt: new Date('2026-10-01T00:00:00.000Z'),
    vocabMasteries: [{ masteryScore: 4 } as never],
    textTargets: [
        {
            id: 'tt-1',
            vocabId: 'vocab-1',
            textTarget: 'xin chao',
            grammar: 'interjection',
            explanationSource: 'a greeting',
            explanationTarget: null,
            wordType: { id: 'wt-1', name: 'interjection' } as never,
            vocabExamples: [{ id: 'ex-1', source: 'Hello!', target: 'Xin chao!' }] as never,
            textTargetSubjects: [{ subject: { id: 's-1', name: 'Greetings' } }] as never,
        } as never,
    ],
};

describe('PublicVocabDto', () => {
    it('maps the vocab and its meanings to public fields', () => {
        const dto = new PublicVocabDto(entity);

        expect(dto).toEqual({
            textSource: 'hello',
            sourceLanguageCode: 'en',
            targetLanguageCode: 'vi',
            masteryScore: 4,
            createdAt: '2026-10-01T00:00:00.000Z',
            meanings: [
                {
                    text: 'xin chao',
                    grammar: 'interjection',
                    wordType: 'interjection',
                    explanationSource: 'a greeting',
                    explanationTarget: null,
                    subjects: ['Greetings'],
                    examples: [{ source: 'Hello!', target: 'Xin chao!' }],
                },
            ],
        });
    });

    it('never exposes internal ids, user or folder ids, or embedding state', () => {
        const serialised = JSON.stringify(new PublicVocabDto(entity));

        expect(serialised).not.toMatch(/"id"|userId|languageFolderId|vocabId|owner-1|folder-1|tt-1|ex-1|wt-1|s-1/);
    });

    it('returns null mastery and an empty meaning list when the row has no details', () => {
        const dto = new PublicVocabDto({ ...entity, vocabMasteries: [], textTargets: undefined });

        expect(dto.masteryScore).toBeNull();
        expect(dto.meanings).toEqual([]);
    });
});
