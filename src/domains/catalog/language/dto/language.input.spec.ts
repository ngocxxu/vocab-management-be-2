import { validateSync } from 'class-validator';
import { LanguageInput } from './language.input';

const errorsFor = (code: string): string[] => {
    const input = Object.assign(new LanguageInput(), { code, name: 'English' });

    return validateSync(input).map((error) => error.property);
};

describe('LanguageInput code', () => {
    it.each(['en', 'vi', 'zh', 'en-US', 'zh-TW'])('accepts %s', (code) => {
        expect(errorsFor(code)).not.toContain('code');
    });

    it.each(['EN', 'english', 'en-us', 'e', 'en_US', 'en-USA', ' en'])('rejects %j', (code) => {
        expect(errorsFor(code)).toContain('code');
    });
});
