import { IdentityLinkPlanInput, parseIdentityLinkCsv, planIdentityLinks } from './identity-link-plan.util';

const ISSUER = 'https://vocab-development.jp.auth0.com/';
const HEADER = 'userId,auth0Sub,auth0Email,auth0EmailVerified';

describe('parseIdentityLinkCsv', () => {
    it('reads rows under the expected header and trims cells', () => {
        const { rows, errors } = parseIdentityLinkCsv(`${HEADER}\n u-1 , auth0|abc , Ann@Example.com , TRUE \n`);

        expect(errors).toEqual([]);
        expect(rows).toEqual([{ line: 2, userId: 'u-1', auth0Sub: 'auth0|abc', auth0Email: 'Ann@Example.com', auth0EmailVerified: true }]);
    });

    it('only the word true counts as verified', () => {
        const { rows } = parseIdentityLinkCsv(`${HEADER}\nu-1,auth0|a,a@b.c,yes\nu-2,auth0|b,b@b.c,1\nu-3,auth0|c,c@b.c,\n`);

        expect(rows.map((row) => row.auth0EmailVerified)).toEqual([false, false, false]);
    });

    it('rejects a wrong header and malformed lines instead of guessing', () => {
        expect(parseIdentityLinkCsv('userId,sub\nu-1,x').errors).toEqual(['header must be exactly: userId,auth0Sub,auth0Email,auth0EmailVerified']);

        const { rows, errors } = parseIdentityLinkCsv(`${HEADER}\nu-1,auth0|a,a@b.c\nu-2,,b@b.c,true\n`);
        expect(rows).toEqual([]);
        expect(errors).toEqual(['line 2: expected 4 columns', 'line 3: userId, auth0Sub and auth0Email are required']);
    });

    it('accepts a file saved by a spreadsheet with a UTF-8 byte order mark', () => {
        const { rows, errors } = parseIdentityLinkCsv(`\uFEFF${HEADER}\r\nu-1,auth0|a,a@b.c,true\r\n`);

        expect(errors).toEqual([]);
        expect(rows).toHaveLength(1);
    });

    it('ignores blank lines', () => {
        expect(parseIdentityLinkCsv(`${HEADER}\n\nu-1,auth0|a,a@b.c,true\n\n`).rows).toHaveLength(1);
    });
});

describe('planIdentityLinks', () => {
    const user = (overrides = {}) => ({ id: 'u-1', email: 'ann@example.com', emailConfirmed: true, isActive: true, ...overrides });
    const row = (overrides = {}) => ({ line: 2, userId: 'u-1', auth0Sub: 'auth0|abc', auth0Email: 'ann@example.com', auth0EmailVerified: true, ...overrides });
    const plan = (overrides: Partial<IdentityLinkPlanInput> = {}) => planIdentityLinks({ issuer: ISSUER, rows: [row()], users: [user()], existing: [], ...overrides });

    it('links a reviewed pair whose email is verified on both sides', () => {
        const result = plan();

        expect(result.toLink).toEqual([{ userId: 'u-1', issuer: ISSUER, subject: 'auth0|abc' }]);
        expect(result.refused).toEqual([]);
    });

    it('compares emails ignoring case', () => {
        expect(plan({ rows: [row({ auth0Email: 'ANN@Example.com' })] }).toLink).toHaveLength(1);
    });

    it('is idempotent: a pair that is already linked is reported, not rewritten', () => {
        const result = plan({ existing: [{ userId: 'u-1', subject: 'auth0|abc' }] });

        expect(result.toLink).toEqual([]);
        expect(result.alreadyLinked).toHaveLength(1);
    });

    it.each([
        ['user_not_found', { users: [] }],
        ['user_inactive', { users: [user({ isActive: false })] }],
        ['local_email_unconfirmed', { users: [user({ emailConfirmed: false })] }],
        ['auth0_email_unverified', { rows: [row({ auth0EmailVerified: false })] }],
        ['email_mismatch', { rows: [row({ auth0Email: 'someone.else@example.com' })] }],
        ['user_has_other_identity', { existing: [{ userId: 'u-1', subject: 'google-oauth2|other' }] }],
        ['subject_mapped_to_other_user', { existing: [{ userId: 'u-OTHER', subject: 'auth0|abc' }] }],
    ])('refuses a row with %s and links nothing', (reason, overrides: Partial<IdentityLinkPlanInput>) => {
        const result = plan(overrides);

        expect(result.refused).toEqual([{ line: 2, userId: 'u-1', reason }]);
        expect(result.toLink).toEqual([]);
    });

    it('refuses every row that repeats a user or a subject', () => {
        const result = plan({
            rows: [row({ line: 2 }), row({ line: 3, userId: 'u-2', auth0Sub: 'auth0|abc' }), row({ line: 4, userId: 'u-1', auth0Sub: 'auth0|zzz' })],
            users: [user(), user({ id: 'u-2', email: 'ann@example.com' })],
        });

        expect(result.refused.map((entry) => `${entry.line}:${entry.reason}`)).toEqual(['2:duplicate_in_list', '3:duplicate_in_list', '4:duplicate_in_list']);
        expect(result.toLink).toEqual([]);
    });
});
