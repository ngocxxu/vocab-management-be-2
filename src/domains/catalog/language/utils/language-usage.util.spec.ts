import { countUsageForCode, TLanguageUsagePair } from './language-usage.util';

describe('countUsageForCode', () => {
    it('adds the counts of every group that has the code on either side', () => {
        const pairs: TLanguageUsagePair[] = [
            { sourceLanguageCode: 'en', targetLanguageCode: 'vi', count: 2 },
            { sourceLanguageCode: 'fr', targetLanguageCode: 'en', count: 5 },
            { sourceLanguageCode: 'fr', targetLanguageCode: 'vi', count: 7 },
        ];

        expect(countUsageForCode(pairs, 'en')).toBe(7);
        expect(countUsageForCode(pairs, 'vi')).toBe(9);
    });

    it('counts a group once when the code is on both sides', () => {
        const pairs: TLanguageUsagePair[] = [{ sourceLanguageCode: 'vi', targetLanguageCode: 'vi', count: 4 }];

        expect(countUsageForCode(pairs, 'vi')).toBe(4);
    });

    it('returns zero for a code no group uses', () => {
        expect(countUsageForCode([{ sourceLanguageCode: 'en', targetLanguageCode: 'vi', count: 2 }], 'ja')).toBe(0);
        expect(countUsageForCode([], 'en')).toBe(0);
    });
});
