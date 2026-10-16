/** Auth0 stores a Google login as `google-oauth2|<Google account id>`. */
export const googleSubject = (providerId: string): string => `google-oauth2|${providerId}`;

export interface GoogleIdentitySource {
    /** Supabase `auth.identities.provider_id`: the Google account id. */
    providerId: string;
    /** `identity_data.sub` when Supabase has it; must agree with `providerId`. */
    subClaim?: string;
}

export interface SupabaseGoogleUser {
    supabaseUserId: string;
    googleIdentities: GoogleIdentitySource[];
}

export interface PlannedIdentity {
    userId: string;
    issuer: string;
    subject: string;
}

export type UnmappedReason = 'no_local_user';
export type AmbiguousReason = 'multiple_google_identities' | 'provider_id_mismatch' | 'duplicate_subject' | 'subject_mapped_to_other_user' | 'user_has_other_identity';

export interface SkippedUser<TReason extends string> {
    supabaseUserId: string;
    reason: TReason;
}

export interface PlanGoogleIdentitiesInput {
    issuer: string;
    supabaseUsers: SupabaseGoogleUser[];
    localUsers: { id: string; supabaseUserId: string }[];
    /** Identities already stored for `issuer`. */
    existing: { userId: string; subject: string }[];
}

export interface GoogleIdentityPlan {
    toCreate: PlannedIdentity[];
    alreadyMapped: PlannedIdentity[];
    unmapped: SkippedUser<UnmappedReason>[];
    ambiguous: SkippedUser<AmbiguousReason>[];
}

/**
 * Decides which Identity rows to write for existing Supabase Google logins.
 * A user is matched only through Supabase's own user id (`users.supabase_user_id`), never by email, and anything
 * that is not a one-to-one match is reported instead of written.
 */
export function planGoogleIdentities({ issuer, supabaseUsers, localUsers, existing }: PlanGoogleIdentitiesInput): GoogleIdentityPlan {
    const localBySupabaseId = new Map(localUsers.map((user) => [user.supabaseUserId, user.id]));
    const existingBySubject = new Map(existing.map((identity) => [identity.subject, identity.userId]));
    const subjectsByUser = new Map<string, Set<string>>();
    for (const identity of existing) {
        subjectsByUser.set(identity.userId, (subjectsByUser.get(identity.userId) ?? new Set()).add(identity.subject));
    }

    const subjectUseCount = new Map<string, number>();
    for (const user of supabaseUsers) {
        if (user.googleIdentities.length === 1) {
            const subject = googleSubject(user.googleIdentities[0].providerId);
            subjectUseCount.set(subject, (subjectUseCount.get(subject) ?? 0) + 1);
        }
    }

    const plan: GoogleIdentityPlan = { toCreate: [], alreadyMapped: [], unmapped: [], ambiguous: [] };

    for (const user of supabaseUsers) {
        const { supabaseUserId, googleIdentities } = user;
        if (googleIdentities.length === 0) {
            continue;
        }
        if (googleIdentities.length > 1) {
            plan.ambiguous.push({ supabaseUserId, reason: 'multiple_google_identities' });
            continue;
        }

        const [identity] = googleIdentities;
        if (identity.subClaim !== undefined && identity.subClaim !== identity.providerId) {
            plan.ambiguous.push({ supabaseUserId, reason: 'provider_id_mismatch' });
            continue;
        }

        const userId = localBySupabaseId.get(supabaseUserId);
        if (!userId) {
            plan.unmapped.push({ supabaseUserId, reason: 'no_local_user' });
            continue;
        }

        const subject = googleSubject(identity.providerId);
        if ((subjectUseCount.get(subject) ?? 0) > 1) {
            plan.ambiguous.push({ supabaseUserId, reason: 'duplicate_subject' });
            continue;
        }

        const planned: PlannedIdentity = { userId, issuer, subject };
        const owner = existingBySubject.get(subject);
        if (owner === undefined) {
            // A user that already maps to another subject here is not given a second one silently.
            if (subjectsByUser.has(userId)) {
                plan.ambiguous.push({ supabaseUserId, reason: 'user_has_other_identity' });
                continue;
            }
            plan.toCreate.push(planned);
        } else if (owner === userId) {
            plan.alreadyMapped.push(planned);
        } else {
            plan.ambiguous.push({ supabaseUserId, reason: 'subject_mapped_to_other_user' });
        }
    }

    return plan;
}
