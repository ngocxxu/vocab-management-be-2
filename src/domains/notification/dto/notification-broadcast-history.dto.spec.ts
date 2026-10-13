import { PriorityLevel } from '@prisma/client';
import { BroadcastHistoryDto } from './notification-broadcast-history.dto';

const row = {
    id: 'n1',
    data: { message: 'Maintenance tonight' },
    priority: PriorityLevel.HIGH,
    isActive: true,
    expiresAt: new Date('2030-01-01T00:00:00Z'),
    createdAt: new Date('2029-12-30T08:00:00Z'),
    _count: { notificationRecipients: 42 },
};

describe('BroadcastHistoryDto', () => {
    it('maps the message, priority, active flag, expiry and recipient count from a stored broadcast', () => {
        const dto = new BroadcastHistoryDto(row);

        expect(dto).toEqual({
            id: 'n1',
            message: 'Maintenance tonight',
            priority: PriorityLevel.HIGH,
            isActive: true,
            expiresAt: new Date('2030-01-01T00:00:00Z'),
            createdAt: new Date('2029-12-30T08:00:00Z'),
            recipientCount: 42,
        });
    });

    it('gives an empty message when the stored data has no message', () => {
        const dto = new BroadcastHistoryDto({ ...row, data: {} });

        expect(dto.message).toBe('');
    });
});
