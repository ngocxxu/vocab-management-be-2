import { Plan, UserRole } from '@prisma/client';
import { PlanRepository } from '../repositories';
import { PlanService } from './plan.service';

// Prisma returns Decimal for price; the mapper calls Number() on it, so a plain number works in the fixture.
const makePlan = (overrides: Partial<Record<keyof Plan, unknown>> = {}): Plan =>
    ({
        id: 'plan-guest',
        role: UserRole.GUEST,
        name: 'Guest',
        price: null,
        priceLabel: 'Free',
        limits: { vocabPerDay: 20, languageFolders: 2, subjects: 5, requestsPerMinute: 20 },
        features: ['20 vocabs per day'],
        stripePriceId: null,
        sortOrder: 0,
        isActive: true,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        ...overrides,
    }) as unknown as Plan;

describe('PlanService.findAllForAdmin', () => {
    it('returns every plan, inactive ones included, with the admin fields', async () => {
        const planRepository = {
            findAll: jest.fn().mockResolvedValue([
                makePlan(),
                makePlan({
                    id: 'plan-member',
                    role: UserRole.MEMBER,
                    name: 'Member',
                    price: 9.99,
                    priceLabel: '$9.99/mo',
                    limits: { vocabPerDay: -1, languageFolders: -1, subjects: -1, requestsPerMinute: 60 },
                    features: ['Unlimited vocabs'],
                    stripePriceId: 'price_member',
                    sortOrder: 1,
                    isActive: false,
                }),
            ]),
        };
        const service = new PlanService(planRepository as unknown as PlanRepository);

        const result = await service.findAllForAdmin();

        expect(planRepository.findAll).toHaveBeenCalledTimes(1);
        expect(result).toEqual([
            {
                id: 'plan-guest',
                role: UserRole.GUEST,
                name: 'Guest',
                price: null,
                priceLabel: 'Free',
                limits: { vocabPerDay: 20, languageFolders: 2, subjects: 5, requestsPerMinute: 20 },
                features: ['20 vocabs per day'],
                stripePriceId: null,
                sortOrder: 0,
                isActive: true,
            },
            {
                id: 'plan-member',
                role: UserRole.MEMBER,
                name: 'Member',
                price: 9.99,
                priceLabel: '$9.99/mo',
                limits: { vocabPerDay: -1, languageFolders: -1, subjects: -1, requestsPerMinute: 60 },
                features: ['Unlimited vocabs'],
                stripePriceId: 'price_member',
                sortOrder: 1,
                isActive: false,
            },
        ]);
    });

    it('returns an empty list when no plan rows exist', async () => {
        const service = new PlanService({ findAll: jest.fn().mockResolvedValue([]) } as unknown as PlanRepository);

        await expect(service.findAllForAdmin()).resolves.toEqual([]);
    });
});
