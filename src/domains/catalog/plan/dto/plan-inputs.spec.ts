import { UserRole } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePlanInput } from './create-plan.input';
import { UpdatePlanInput } from './update-plan.input';

describe('Plan inputs limits validation', () => {
    const createBase = { role: UserRole.GUEST, name: 'Guest', priceLabel: 'Free' };

    const errorsFor = async <T extends object>(cls: new () => T, plain: Record<string, unknown>) => {
        const errors = await validate(plainToInstance(cls, plain));
        return errors.map((error) => error.property);
    };

    it('rejects a create request without limits', async () => {
        expect(await errorsFor(CreatePlanInput, createBase)).toContain('limits');
    });

    it('rejects a create request with null limits', async () => {
        expect(await errorsFor(CreatePlanInput, { ...createBase, limits: null })).toContain('limits');
    });

    it('rejects a create request with a non-integer limit', async () => {
        expect(await errorsFor(CreatePlanInput, { ...createBase, limits: { subjects: 2.5 } })).toContain('limits');
    });

    it('rejects an update that sends limits as null', async () => {
        expect(await errorsFor(UpdatePlanInput, { limits: null })).toContain('limits');
    });

    it('rejects an update with a value below -1', async () => {
        expect(await errorsFor(UpdatePlanInput, { limits: { vocabPerDay: -2 } })).toContain('limits');
    });

    it('accepts an update that does not send limits', async () => {
        expect(await errorsFor(UpdatePlanInput, { name: 'Renamed' })).toEqual([]);
    });

    it.each([[[]], [{}], [{ foo: 1 }]])('rejects create limits %p because no known limit is set', async (limits) => {
        expect(await errorsFor(CreatePlanInput, { ...createBase, limits })).toContain('limits');
    });

    it.each([[[]], [{}], [{ foo: 1 }]])('rejects update limits %p because no known limit is set', async (limits) => {
        expect(await errorsFor(UpdatePlanInput, { limits })).toContain('limits');
    });

    it('rejects a limit above the upper bound', async () => {
        expect(await errorsFor(UpdatePlanInput, { limits: { vocabPerDay: 2147483648 } })).toContain('limits');
        expect(await errorsFor(UpdatePlanInput, { limits: { vocabPerDay: 1e21 } })).toContain('limits');
    });

    it('accepts a limit at the upper bound', async () => {
        expect(await errorsFor(UpdatePlanInput, { limits: { vocabPerDay: 2147483647 } })).toEqual([]);
    });

    it('accepts a valid create request', async () => {
        expect(await errorsFor(CreatePlanInput, { ...createBase, limits: { vocabPerDay: 20, subjects: -1 } })).toEqual([]);
    });
});
