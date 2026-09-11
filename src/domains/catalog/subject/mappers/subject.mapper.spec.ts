import { Subject } from '@prisma/client';
import { SubjectMapper } from './subject.mapper';

function buildSubject(id: string): Subject {
    return {
        id,
        name: `Subject ${id}`,
        order: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: 'user-1',
    };
}

describe('SubjectMapper', () => {
    const mapper = new SubjectMapper();

    it('maps vocabCount from the counts map, deduped by distinct vocab already at the count-source', () => {
        const subjects = [buildSubject('subject-1'), buildSubject('subject-2')];
        // Simulates: subject-1 has one vocab with 2 textTargets tagged to it (still counted once upstream)
        const counts = new Map<string, number>([['subject-1', 1]]);

        const result = mapper.toResponseListWithCount(subjects, counts);

        expect(result[0].vocabCount).toBe(1);
        expect(result[1].vocabCount).toBe(0);
    });

    it('defaults to 0 for a subject with no vocabs', () => {
        const subjects = [buildSubject('empty-subject')];

        const result = mapper.toResponseListWithCount(subjects, new Map());

        expect(result[0].vocabCount).toBe(0);
    });
});
