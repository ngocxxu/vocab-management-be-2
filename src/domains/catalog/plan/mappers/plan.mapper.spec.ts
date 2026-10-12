import { UserRole } from '@prisma/client';
import { CreatePlanInput } from '../dto/create-plan.input';
import { UpdatePlanInput } from '../dto/update-plan.input';
import { PlanMapper } from './plan.mapper';

describe('PlanMapper limits', () => {
    const mapper = new PlanMapper();

    const createInput = (limits: Record<string, unknown>): CreatePlanInput =>
        ({
            role: UserRole.GUEST,
            name: 'Guest',
            priceLabel: 'Free',
            limits,
        }) as unknown as CreatePlanInput;

    it('persists only the known limit keys on create', () => {
        const result = mapper.toCreateInput(createInput({ vocabPerDay: 20, languageFolders: 2, subjects: 5, requestsPerMinute: 20, bogus: 1 }));

        expect(result.limits).toEqual({ vocabPerDay: 20, languageFolders: 2, subjects: 5, requestsPerMinute: 20 });
    });

    it('creates an inactive plan when the create input says so', () => {
        const result = mapper.toCreateInput({ ...createInput({ subjects: 5 }), isActive: false } as CreatePlanInput);

        expect(result.isActive).toBe(false);
    });

    it('creates an active plan when the create input leaves isActive out', () => {
        const result = mapper.toCreateInput(createInput({ subjects: 5 }));

        expect(result.isActive).toBe(true);
    });

    it('persists only the known limit keys on update', () => {
        const input = { limits: { subjects: -1, unknownKey: 'x' } } as unknown as UpdatePlanInput;

        const result = mapper.toUpdateInput(input);

        expect(result.limits).toEqual({ subjects: -1 });
    });

    it('leaves limits out of an update that does not send them', () => {
        const result = mapper.toUpdateInput({ name: 'Renamed' } as UpdatePlanInput);

        expect(result).not.toHaveProperty('limits');
    });
});
