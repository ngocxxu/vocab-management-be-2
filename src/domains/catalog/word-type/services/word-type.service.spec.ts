import { WordTypeRepository } from '../repositories';
import { WordTypeService } from './word-type.service';

describe('WordTypeService.findAllForAdmin', () => {
    it('returns each word type with how many text targets use it, in the repository order', async () => {
        const repository = {
            findAllWithTextTargetCount: jest.fn().mockResolvedValue([
                {
                    id: 'wt-noun',
                    name: 'Noun',
                    description: 'A person, place or thing',
                    textTargetCount: 12,
                    createdAt: new Date('2026-01-01T00:00:00.000Z'),
                    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
                },
                {
                    id: 'wt-verb',
                    name: 'Verb',
                    description: 'An action or state',
                    textTargetCount: 0,
                    createdAt: new Date('2026-01-01T00:00:00.000Z'),
                    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
                },
            ]),
        };
        const service = new WordTypeService(repository as unknown as WordTypeRepository);

        const result = await service.findAllForAdmin();

        expect(result.map((row) => [row.name, row.textTargetCount])).toEqual([
            ['Noun', 12],
            ['Verb', 0],
        ]);
        expect(result[0]).toEqual(expect.objectContaining({ id: 'wt-noun', description: 'A person, place or thing' }));
    });
});
