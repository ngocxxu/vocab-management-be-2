export const DEFAULT_SRS_TIMEZONE = 'Asia/Ho_Chi_Minh';

/** Config (scope USER) key that holds the timezone of the user; the review queue reads it to find the end of the day. */
export const SRS_TIMEZONE_CONFIG_KEY = 'srs.timezone';

/** A review day starts at 04:00 local time, so cards studied after midnight still count for the day before. */
const DAY_ROLLOVER_HOUR = 4;

type LocalParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

export function isValidTimezone(timeZone: string): boolean {
    try {
        new Intl.DateTimeFormat('en-US', { timeZone });

        return timeZone.length > 0;
    } catch {
        return false;
    }
}

/** The timezone to use for a value read from Config: the value when it is a valid IANA name, the default otherwise. */
export function resolveTimezone(configured: unknown): string {
    return typeof configured === 'string' && isValidTimezone(configured) ? configured : DEFAULT_SRS_TIMEZONE;
}

/** The local calendar date (YYYY-MM-DD) at `instant`. */
export function localDateLabel(instant: Date, timeZone: string): string {
    const { year, month, day } = localParts(instant, timeZone);

    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function localParts(instant: Date, timeZone: string): LocalParts {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
    }).formatToParts(instant);
    const value = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.find((part) => part.type === type)?.value);

    return { year: value('year'), month: value('month'), day: value('day'), hour: value('hour'), minute: value('minute'), second: value('second') };
}

/** Local wall-clock time minus UTC at `instant`, in ms (the UTC offset of the zone at that moment). */
function offsetMs(instant: Date, timeZone: string): number {
    const p = localParts(instant, timeZone);
    const wallClockAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);

    return wallClockAsUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The instant at which the local clock shows `hour`:00 on the given local date (day may overflow: day 0 is the day before). */
function localTimeToInstant(year: number, month: number, day: number, hour: number, timeZone: string): Date {
    const wallClockAsUtc = Date.UTC(year, month - 1, day, hour);
    const firstGuess = wallClockAsUtc - offsetMs(new Date(wallClockAsUtc), timeZone);
    // The offset can differ at the guessed instant when a DST change lies in between: correct once.
    const secondGuess = wallClockAsUtc - offsetMs(new Date(firstGuess), timeZone);

    return new Date(secondGuess);
}

/** The latest 04:00 local time that is not after `now`: the start of the review day `now` belongs to. */
export function startOfLocalDay(now: Date, timeZone: string): Date {
    const p = localParts(now, timeZone);
    const todayRollover = localTimeToInstant(p.year, p.month, p.day, DAY_ROLLOVER_HOUR, timeZone);

    return todayRollover.getTime() <= now.getTime() ? todayRollover : localTimeToInstant(p.year, p.month, p.day - 1, DAY_ROLLOVER_HOUR, timeZone);
}

/** The earliest 04:00 local time after `now`: the end of the review day `now` belongs to (a day is 23 to 25 hours around DST). */
export function endOfLocalDay(now: Date, timeZone: string): Date {
    const start = localParts(startOfLocalDay(now, timeZone), timeZone);

    return localTimeToInstant(start.year, start.month, start.day + 1, DAY_ROLLOVER_HOUR, timeZone);
}
