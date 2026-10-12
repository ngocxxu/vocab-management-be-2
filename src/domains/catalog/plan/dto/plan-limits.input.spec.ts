import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PlanLimitsInput } from './plan-limits.input';

describe('PlanLimitsInput', () => {
    const errorsFor = async (plain: Record<string, unknown>) => {
        const errors = await validate(plainToInstance(PlanLimitsInput, plain));
        return errors.map((error) => error.property);
    };

    it.each([[-1], [0], [20]])('accepts integer %p', async (value) => {
        expect(await errorsFor({ vocabPerDay: value })).toEqual([]);
    });

    it.each([[2.5], [-2], ['5'], ['abc'], [null]])('rejects %p for vocabPerDay', async (value) => {
        expect(await errorsFor({ vocabPerDay: value })).toEqual(['vocabPerDay']);
    });

    it('rejects a non-integer subjects value', async () => {
        expect(await errorsFor({ subjects: 1.5 })).toEqual(['subjects']);
    });

    it('rejects a value below -1 for languageFolders', async () => {
        expect(await errorsFor({ languageFolders: -5 })).toEqual(['languageFolders']);
    });

    it('accepts an empty limits object so a partial update is possible', async () => {
        expect(await errorsFor({})).toEqual([]);
    });
});
