import { DEFAULT_SRS_TIMEZONE, endOfLocalDay, isValidTimezone, startOfLocalDay } from './fsrs-local-day.util';

const HOUR_MS = 60 * 60 * 1000;

describe('fsrs-local-day', () => {
    describe('a fixed offset, UTC+7', () => {
        const tz = 'Asia/Ho_Chi_Minh';

        test('the local day runs from 04:00 to the next 04:00', () => {
            // Arrange: 17:00 local on 4 Oct
            const now = new Date('2026-10-04T10:00:00.000Z');

            // Act + Assert
            expect(startOfLocalDay(now, tz).toISOString()).toBe('2026-10-03T21:00:00.000Z');
            expect(endOfLocalDay(now, tz).toISOString()).toBe('2026-10-04T21:00:00.000Z');
        });

        test('03:59 local still belongs to the previous day', () => {
            // Arrange: 03:59 local on 5 Oct
            const now = new Date('2026-10-04T20:59:00.000Z');

            // Act + Assert
            expect(startOfLocalDay(now, tz).toISOString()).toBe('2026-10-03T21:00:00.000Z');
            expect(endOfLocalDay(now, tz).toISOString()).toBe('2026-10-04T21:00:00.000Z');
        });

        test('04:00 local sharp starts the new day', () => {
            // Arrange: 04:00 local on 5 Oct
            const now = new Date('2026-10-04T21:00:00.000Z');

            // Act + Assert
            expect(startOfLocalDay(now, tz).toISOString()).toBe('2026-10-04T21:00:00.000Z');
            expect(endOfLocalDay(now, tz).toISOString()).toBe('2026-10-05T21:00:00.000Z');
        });
    });

    test('UTC-8 (Los Angeles in winter)', () => {
        // Arrange: 07:00 local on 15 Jan 2027
        const now = new Date('2027-01-15T15:00:00.000Z');

        // Act + Assert
        expect(startOfLocalDay(now, 'America/Los_Angeles').toISOString()).toBe('2027-01-15T12:00:00.000Z');
        expect(endOfLocalDay(now, 'America/Los_Angeles').toISOString()).toBe('2027-01-16T12:00:00.000Z');
    });

    test('UTC+5:30 (India)', () => {
        // Arrange: 05:30 local on 4 Oct
        const now = new Date('2026-10-04T00:00:00.000Z');

        // Act + Assert
        expect(startOfLocalDay(now, 'Asia/Kolkata').toISOString()).toBe('2026-10-03T22:30:00.000Z');
        expect(endOfLocalDay(now, 'Asia/Kolkata').toISOString()).toBe('2026-10-04T22:30:00.000Z');
    });

    test('the day that loses an hour to DST is 23 hours long', () => {
        // Arrange: 15:00 EST on 13 Mar 2027, clocks go forward the next night
        const now = new Date('2027-03-13T20:00:00.000Z');

        // Act
        const start = startOfLocalDay(now, 'America/New_York');
        const end = endOfLocalDay(now, 'America/New_York');

        // Assert
        expect(start.toISOString()).toBe('2027-03-13T09:00:00.000Z');
        expect(end.toISOString()).toBe('2027-03-14T08:00:00.000Z');
        expect((end.getTime() - start.getTime()) / HOUR_MS).toBe(23);
    });

    test('the day that gains an hour to DST is 25 hours long', () => {
        // Arrange: 16:00 EDT on 6 Nov 2027, clocks go back the next night
        const now = new Date('2027-11-06T20:00:00.000Z');

        // Act
        const start = startOfLocalDay(now, 'America/New_York');
        const end = endOfLocalDay(now, 'America/New_York');

        // Assert
        expect(start.toISOString()).toBe('2027-11-06T08:00:00.000Z');
        expect(end.toISOString()).toBe('2027-11-07T09:00:00.000Z');
        expect((end.getTime() - start.getTime()) / HOUR_MS).toBe(25);
    });

    test('now is always inside [start, end)', () => {
        // Arrange
        const instants = ['2026-12-31T23:59:59.000Z', '2027-02-28T21:00:00.000Z', '2027-03-14T07:59:00.000Z', '2027-11-07T08:59:00.000Z'];

        for (const iso of instants) {
            const now = new Date(iso);
            for (const tz of ['Asia/Ho_Chi_Minh', 'America/New_York', 'Asia/Kolkata', 'Pacific/Auckland']) {
                // Act
                const start = startOfLocalDay(now, tz).getTime();
                const end = endOfLocalDay(now, tz).getTime();

                // Assert
                expect(start).toBeLessThanOrEqual(now.getTime());
                expect(now.getTime()).toBeLessThan(end);
            }
        }
    });

    test('isValidTimezone accepts IANA names and rejects anything else', () => {
        expect(isValidTimezone(DEFAULT_SRS_TIMEZONE)).toBe(true);
        expect(isValidTimezone('Europe/Paris')).toBe(true);
        expect(isValidTimezone('Mars/Olympus')).toBe(false);
        expect(isValidTimezone('')).toBe(false);
    });
});
