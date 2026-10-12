import { PriorityLevel, UserRole } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { BroadcastNotificationInput, BroadcastTarget } from './notification-broadcast.input';

const TOMORROW = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
const base = { message: 'Maintenance tonight', priority: PriorityLevel.HIGH, expiresAt: TOMORROW };

const errorsFor = (plain: Record<string, unknown>) => validateSync(plainToInstance(BroadcastNotificationInput, plain));
const failedFields = (plain: Record<string, unknown>) => errorsFor(plain).map((error) => error.property);

describe('BroadcastNotificationInput', () => {
    it('accepts an all-users broadcast with a message, priority and expiry', () => {
        expect(errorsFor({ ...base, target: BroadcastTarget.ALL })).toHaveLength(0);
    });

    it('accepts a message of exactly 500 characters', () => {
        expect(errorsFor({ ...base, message: 'a'.repeat(500), target: BroadcastTarget.ALL })).toHaveLength(0);
    });

    it('rejects a message over 500 characters', () => {
        expect(failedFields({ ...base, message: 'a'.repeat(501), target: BroadcastTarget.ALL })).toContain('message');
    });

    it('rejects a message that is only spaces', () => {
        expect(failedFields({ ...base, message: '   ', target: BroadcastTarget.ALL })).toContain('message');
    });

    it('rejects a priority outside LOW, MEDIUM and HIGH', () => {
        expect(failedFields({ ...base, priority: 'URGENT', target: BroadcastTarget.ALL })).toContain('priority');
    });

    it('turns the ISO expiry string into a Date', () => {
        const input = plainToInstance(BroadcastNotificationInput, { ...base, target: BroadcastTarget.ALL });

        expect(input.expiresAt).toBeInstanceOf(Date);
        expect(input.expiresAt.toISOString()).toBe(TOMORROW);
    });

    it('rejects an expiry that is not a date', () => {
        expect(failedFields({ ...base, expiresAt: 'soon', target: BroadcastTarget.ALL })).toContain('expiresAt');
    });

    it('requires a role for a role broadcast', () => {
        expect(failedFields({ ...base, target: BroadcastTarget.ROLE })).toContain('role');
    });

    it('accepts a role broadcast with a valid role', () => {
        expect(errorsFor({ ...base, target: BroadcastTarget.ROLE, role: UserRole.MEMBER })).toHaveLength(0);
    });

    it('requires at least one user for a users broadcast', () => {
        expect(failedFields({ ...base, target: BroadcastTarget.USERS, userIds: [] })).toContain('userIds');
    });

    it('accepts a users broadcast with user IDs', () => {
        expect(errorsFor({ ...base, target: BroadcastTarget.USERS, userIds: ['user-1'] })).toHaveLength(0);
    });
});
