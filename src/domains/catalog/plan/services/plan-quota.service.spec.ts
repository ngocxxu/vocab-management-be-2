import { Logger } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PlanQuotaExceededException } from '../exceptions';
import { PlanRepository } from '../repositories';
import { PlanQuotaService } from './plan-quota.service';

type TStoredPlan = { limits: unknown; isActive: boolean } | null;

describe('PlanQuotaService plan limits', () => {
    const createService = (options: { plan?: TStoredPlan | (() => TStoredPlan); redisCount?: number; folderCount?: number; subjectCount?: number } = {}) => {
        const redis = {
            incr: jest.fn().mockResolvedValue(options.redisCount ?? 1),
            expire: jest.fn().mockResolvedValue(1),
            decr: jest.fn().mockResolvedValue(0),
        };
        const planRepository = {
            findByRole: jest.fn().mockImplementation(async () => {
                const plan = options.plan;
                return Promise.resolve(typeof plan === 'function' ? plan() : (plan ?? null));
            }),
        };
        const languageFolderRepository = { countByUserId: jest.fn().mockResolvedValue(options.folderCount ?? 0) };
        const subjectRepository = { countByUserId: jest.fn().mockResolvedValue(options.subjectCount ?? 0) };
        const redisService = { client: redis };
        const service = new PlanQuotaService(languageFolderRepository as never, subjectRepository as never, redisService as never, planRepository as unknown as PlanRepository);
        return { service, redis, planRepository, languageFolderRepository, subjectRepository };
    };

    describe('ADMIN', () => {
        it('never queries a plan or counts usage for any resource', async () => {
            const { service, planRepository, redis, languageFolderRepository, subjectRepository } = createService({ redisCount: 999, folderCount: 999, subjectCount: 999 });

            await service.assertCreationQuota('admin-1', UserRole.ADMIN, 'vocab');
            await service.assertCreationQuota('admin-1', UserRole.ADMIN, 'languageFolder');
            await service.assertCreationQuota('admin-1', UserRole.ADMIN, 'subject');

            expect(planRepository.findByRole).not.toHaveBeenCalled();
            expect(redis.incr).not.toHaveBeenCalled();
            expect(languageFolderRepository.countByUserId).not.toHaveBeenCalled();
            expect(subjectRepository.countByUserId).not.toHaveBeenCalled();
        });
    });

    describe('unlimited (-1)', () => {
        it('never blocks a MEMBER and never counts usage', async () => {
            const { service, redis, languageFolderRepository, subjectRepository } = createService({
                plan: { limits: { vocabPerDay: -1, languageFolders: -1, subjects: -1 }, isActive: true },
                redisCount: 500,
                folderCount: 500,
                subjectCount: 500,
            });

            await service.assertCreationQuota('member-1', UserRole.MEMBER, 'vocab');
            await service.assertCreationQuota('member-1', UserRole.MEMBER, 'languageFolder');
            await service.assertCreationQuota('member-1', UserRole.MEMBER, 'subject');

            expect(redis.incr).not.toHaveBeenCalled();
            expect(languageFolderRepository.countByUserId).not.toHaveBeenCalled();
            expect(subjectRepository.countByUserId).not.toHaveBeenCalled();
        });

        it('treats -1 in a stored GUEST plan as unlimited', async () => {
            const { service } = createService({
                plan: { limits: { subjects: -1 }, isActive: true },
                subjectCount: 100,
            });

            await expect(service.assertCreationQuota('guest-1', UserRole.GUEST, 'subject')).resolves.toBeUndefined();
        });
    });

    describe('live plan changes', () => {
        it('applies a changed limit on the next create without restart', async () => {
            const plans: TStoredPlan[] = [
                { limits: { vocabPerDay: 5 }, isActive: true },
                { limits: { vocabPerDay: 10 }, isActive: true },
            ];
            const { service, planRepository } = createService({
                plan: () => plans.shift() ?? null,
                redisCount: 6,
            });

            await expect(service.assertCreationQuota('guest-1', UserRole.GUEST, 'vocab')).rejects.toBeInstanceOf(PlanQuotaExceededException);
            await expect(service.assertCreationQuota('guest-1', UserRole.GUEST, 'vocab')).resolves.toBeUndefined();
            expect(planRepository.findByRole).toHaveBeenCalledTimes(2);
        });
    });

    describe('defaults', () => {
        it('uses the GUEST vocab default of 20 per day when the plan is missing', async () => {
            const { service } = createService({ plan: null, redisCount: 21 });

            await expect(service.assertCreationQuota('guest-1', UserRole.GUEST, 'vocab')).rejects.toBeInstanceOf(PlanQuotaExceededException);
        });

        it('allows the 20th vocab of the day under the GUEST default', async () => {
            const { service } = createService({ plan: null, redisCount: 20 });

            await expect(service.assertCreationQuota('guest-1', UserRole.GUEST, 'vocab')).resolves.toBeUndefined();
        });

        it('uses the GUEST subject default of 5 (changed from 3) when the plan is missing', async () => {
            const { service } = createService({ plan: null, subjectCount: 4 });

            await expect(service.assertCreationQuota('guest-1', UserRole.GUEST, 'subject')).resolves.toBeUndefined();

            const { service: full } = createService({ plan: null, subjectCount: 5 });
            await expect(full.assertCreationQuota('guest-1', UserRole.GUEST, 'subject')).rejects.toBeInstanceOf(PlanQuotaExceededException);
        });

        it('uses the GUEST folder default of 2 when the plan is missing', async () => {
            const { service } = createService({ plan: null, folderCount: 2 });

            await expect(service.assertCreationQuota('guest-1', UserRole.GUEST, 'languageFolder')).rejects.toBeInstanceOf(PlanQuotaExceededException);
        });

        it('ignores an inactive plan and uses defaults, so its -1 does not unlock GUEST', async () => {
            const { service } = createService({
                plan: { limits: { subjects: -1 }, isActive: false },
                subjectCount: 5,
            });

            await expect(service.assertCreationQuota('guest-1', UserRole.GUEST, 'subject')).rejects.toBeInstanceOf(PlanQuotaExceededException);
        });

        it('uses the default for a key missing from the stored limits', async () => {
            const { service } = createService({
                plan: { limits: {}, isActive: true },
                folderCount: 2,
            });

            await expect(service.assertCreationQuota('guest-1', UserRole.GUEST, 'languageFolder')).rejects.toBeInstanceOf(PlanQuotaExceededException);
        });

        it('ignores a non-integer stored value and uses the default for that key', async () => {
            const { service } = createService({
                plan: { limits: { languageFolders: 2.5 }, isActive: true },
                folderCount: 2,
            });

            await expect(service.assertCreationQuota('guest-1', UserRole.GUEST, 'languageFolder')).rejects.toBeInstanceOf(PlanQuotaExceededException);
        });

        it('ignores a stored value below -1 and uses the default for that key', async () => {
            const { service } = createService({
                plan: { limits: { subjects: -2 }, isActive: true },
                subjectCount: 5,
            });

            await expect(service.assertCreationQuota('guest-1', UserRole.GUEST, 'subject')).rejects.toBeInstanceOf(PlanQuotaExceededException);
        });

        it('MEMBER with no plan row is unlimited by default', async () => {
            const { service, subjectRepository } = createService({ plan: null, subjectCount: 500 });

            await expect(service.assertCreationQuota('member-1', UserRole.MEMBER, 'subject')).resolves.toBeUndefined();
            expect(subjectRepository.countByUserId).not.toHaveBeenCalled();
        });
    });

    describe('corrupt stored limits', () => {
        it('logs a warning naming the role and key before falling back to the default', async () => {
            const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
            const { service } = createService({ plan: { limits: { subjects: 2.5 }, isActive: true }, subjectCount: 0 });

            await service.assertCreationQuota('guest-1', UserRole.GUEST, 'subject');

            expect(warn).toHaveBeenCalledWith(expect.stringContaining('subjects'));
            warn.mockRestore();
        });

        it('does not log for a key that is simply missing', async () => {
            const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
            const { service } = createService({ plan: { limits: {}, isActive: true }, subjectCount: 0 });

            await service.assertCreationQuota('guest-1', UserRole.GUEST, 'subject');

            expect(warn).not.toHaveBeenCalled();
            warn.mockRestore();
        });
    });

    describe('upgrade hint', () => {
        it('tells a GUEST to upgrade', async () => {
            const { service } = createService({ plan: null, subjectCount: 5 });

            await expect(service.assertCreationQuota('guest-1', UserRole.GUEST, 'subject')).rejects.toThrow('Upgrade to Member');
        });

        it('does not tell a MEMBER with a capped plan to upgrade to Member', async () => {
            const { service } = createService({ plan: { limits: { subjects: 1 }, isActive: true }, subjectCount: 1 });

            await expect(service.assertCreationQuota('member-1', UserRole.MEMBER, 'subject')).rejects.not.toThrow('Upgrade to Member');
        });
    });

    describe('enforcement messages', () => {
        it('names the limit that was reached', async () => {
            const { service } = createService({ plan: { limits: { subjects: 3 }, isActive: true }, subjectCount: 3 });

            await expect(service.assertCreationQuota('guest-1', UserRole.GUEST, 'subject')).rejects.toThrow('Subject limit reached (3)');
        });
    });
});
