import { signInMethodFromSubject } from './sign-in-method.util';

describe('signInMethodFromSubject', () => {
    it.each([
        ['google-oauth2|1234567890', 'google'],
        ['auth0|64f0c0ffee', 'password'],
        ['github|42', 'other'],
        ['constructor|1', 'other'],
        ['no-separator', 'other'],
        ['', 'other'],
    ])('maps %s to %s', (subject, expected) => {
        expect(signInMethodFromSubject(subject)).toBe(expected);
    });

    it('never returns any part of the subject id', () => {
        expect(signInMethodFromSubject('google-oauth2|1234567890')).not.toContain('1234567890');
    });
});
