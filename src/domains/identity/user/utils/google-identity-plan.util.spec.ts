import { googleSubject, planGoogleIdentities, PlanGoogleIdentitiesInput } from './google-identity-plan.util';

const ISSUER = 'https://vocab-development.jp.auth0.com/';

const google = (providerId: string, subClaim?: string) => ({ providerId, subClaim });

describe('planGoogleIdentities', () => {
    const plan = (overrides: Partial<PlanGoogleIdentitiesInput>) => planGoogleIdentities({ issuer: ISSUER, supabaseUsers: [], localUsers: [], existing: [], ...overrides });

    it('builds the Auth0 subject for a Google account', () => {
        expect(googleSubject('1234')).toBe('google-oauth2|1234');
    });

    it('plans an Identity for a Google user that has a local user', () => {
        const result = plan({
            supabaseUsers: [{ supabaseUserId: 'sb-1', googleIdentities: [google('g-1', 'g-1')] }],
            localUsers: [{ id: 'u-1', supabaseUserId: 'sb-1' }],
        });

        expect(result.toCreate).toEqual([{ userId: 'u-1', issuer: ISSUER, subject: 'google-oauth2|g-1' }]);
        expect(result.alreadyMapped).toEqual([]);
        expect(result.unmapped).toEqual([]);
        expect(result.ambiguous).toEqual([]);
    });

    it('is idempotent: an Identity that already exists is not planned again', () => {
        const result = plan({
            supabaseUsers: [{ supabaseUserId: 'sb-1', googleIdentities: [google('g-1')] }],
            localUsers: [{ id: 'u-1', supabaseUserId: 'sb-1' }],
            existing: [{ userId: 'u-1', subject: 'google-oauth2|g-1' }],
        });

        expect(result.toCreate).toEqual([]);
        expect(result.alreadyMapped).toHaveLength(1);
    });

    it('reports a Supabase Google user with no local user as unmapped', () => {
        const result = plan({ supabaseUsers: [{ supabaseUserId: 'sb-ghost', googleIdentities: [google('g-9')] }] });

        expect(result.unmapped).toEqual([{ supabaseUserId: 'sb-ghost', reason: 'no_local_user' }]);
        expect(result.toCreate).toEqual([]);
    });

    it('ignores Supabase users that have no Google identity', () => {
        const result = plan({
            supabaseUsers: [{ supabaseUserId: 'sb-pw', googleIdentities: [] }],
            localUsers: [{ id: 'u-pw', supabaseUserId: 'sb-pw' }],
        });

        expect(result).toEqual({ toCreate: [], alreadyMapped: [], unmapped: [], ambiguous: [] });
    });

    it('never matches by email: a local user without the supabase id is not mapped', () => {
        const result = plan({
            supabaseUsers: [{ supabaseUserId: 'sb-1', googleIdentities: [google('g-1')] }],
            localUsers: [{ id: 'u-other', supabaseUserId: 'sb-different' }],
        });

        expect(result.toCreate).toEqual([]);
        expect(result.unmapped).toHaveLength(1);
    });

    it.each([
        ['more than one Google identity', [{ supabaseUserId: 'sb-1', googleIdentities: [google('g-1'), google('g-2')] }], 'multiple_google_identities'],
        ['a provider id that differs from the sub claim', [{ supabaseUserId: 'sb-1', googleIdentities: [google('g-1', 'g-OTHER')] }], 'provider_id_mismatch'],
    ])('flags %s as ambiguous and plans nothing', (_name, supabaseUsers, reason) => {
        const result = plan({ supabaseUsers, localUsers: [{ id: 'u-1', supabaseUserId: 'sb-1' }] });

        expect(result.ambiguous).toEqual([{ supabaseUserId: 'sb-1', reason }]);
        expect(result.toCreate).toEqual([]);
    });

    it('flags the same Google account on two Supabase users and plans neither', () => {
        const result = plan({
            supabaseUsers: [
                { supabaseUserId: 'sb-1', googleIdentities: [google('g-1')] },
                { supabaseUserId: 'sb-2', googleIdentities: [google('g-1')] },
            ],
            localUsers: [
                { id: 'u-1', supabaseUserId: 'sb-1' },
                { id: 'u-2', supabaseUserId: 'sb-2' },
            ],
        });

        expect(result.ambiguous.map((entry) => entry.reason)).toEqual(['duplicate_subject', 'duplicate_subject']);
        expect(result.toCreate).toEqual([]);
    });

    it('flags a subject already mapped to a different user and leaves it alone', () => {
        const result = plan({
            supabaseUsers: [{ supabaseUserId: 'sb-1', googleIdentities: [google('g-1')] }],
            localUsers: [{ id: 'u-1', supabaseUserId: 'sb-1' }],
            existing: [{ userId: 'u-OTHER', subject: 'google-oauth2|g-1' }],
        });

        expect(result.ambiguous).toEqual([{ supabaseUserId: 'sb-1', reason: 'subject_mapped_to_other_user' }]);
        expect(result.toCreate).toEqual([]);
    });

    it('flags a user that already has a different Identity under this issuer instead of adding a second one', () => {
        const result = plan({
            supabaseUsers: [{ supabaseUserId: 'sb-1', googleIdentities: [google('g-1')] }],
            localUsers: [{ id: 'u-1', supabaseUserId: 'sb-1' }],
            existing: [{ userId: 'u-1', subject: 'google-oauth2|g-DIFFERENT' }],
        });

        expect(result.ambiguous).toEqual([{ supabaseUserId: 'sb-1', reason: 'user_has_other_identity' }]);
        expect(result.toCreate).toEqual([]);
    });
});
