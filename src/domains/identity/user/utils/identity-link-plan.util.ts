import type { PlannedIdentity } from './google-identity-plan.util';

const CSV_HEADER = 'userId,auth0Sub,auth0Email,auth0EmailVerified';
const COLUMN_COUNT = 4;

export interface IdentityLinkRow {
    /** 1-based line in the file, for error messages. */
    line: number;
    userId: string;
    auth0Sub: string;
    auth0Email: string;
    auth0EmailVerified: boolean;
}

export type IdentityLinkRefusal =
    | 'duplicate_in_list'
    | 'user_not_found'
    | 'user_inactive'
    | 'local_email_unconfirmed'
    | 'auth0_email_unverified'
    | 'email_mismatch'
    | 'subject_mapped_to_other_user'
    | 'user_has_other_identity';

export interface RefusedLink {
    line: number;
    userId: string;
    reason: IdentityLinkRefusal;
}

export interface IdentityLinkPlanInput {
    issuer: string;
    rows: IdentityLinkRow[];
    users: { id: string; email: string; emailConfirmed: boolean; isActive: boolean }[];
    /** Identities already stored for `issuer`. */
    existing: { userId: string; subject: string }[];
}

export interface IdentityLinkPlan {
    toLink: PlannedIdentity[];
    alreadyLinked: PlannedIdentity[];
    refused: RefusedLink[];
}

/** Reads the admin-reviewed list. Anything malformed is reported with its line number, never guessed at. */
export function parseIdentityLinkCsv(text: string): { rows: IdentityLinkRow[]; errors: string[] } {
    const lines = text.split(/\r?\n/);
    if (lines[0]?.trim() !== CSV_HEADER) {
        return { rows: [], errors: [`header must be exactly: ${CSV_HEADER}`] };
    }

    const rows: IdentityLinkRow[] = [];
    const errors: string[] = [];
    lines.forEach((raw, index) => {
        if (index === 0 || raw.trim() === '') {
            return;
        }
        const line = index + 1;
        const cells = raw.split(',').map((cell) => cell.trim());
        if (cells.length !== COLUMN_COUNT) {
            errors.push(`line ${line}: expected ${COLUMN_COUNT} columns`);
            return;
        }
        const [userId, auth0Sub, auth0Email, verified] = cells;
        if (!userId || !auth0Sub || !auth0Email) {
            errors.push(`line ${line}: userId, auth0Sub and auth0Email are required`);
            return;
        }
        // Only the word "true" verifies; anything else, including a blank cell, counts as unverified.
        rows.push({ line, userId, auth0Sub, auth0Email, auth0EmailVerified: verified.toLowerCase() === 'true' });
    });
    return { rows, errors };
}

const repeated = <T>(values: T[]): Set<T> => new Set(values.filter((value, index) => values.indexOf(value) !== index));

/**
 * Decides which admin-chosen (user, Auth0 login) pairs may be linked. Email is never used to find a match; it is only
 * a safety check on the pair the admin picked: the User's email must be confirmed, the Auth0 email must be verified,
 * and the two must be the same address. Anything that does not pass is refused with a reason and nothing is written.
 */
export function planIdentityLinks({ issuer, rows, users, existing }: IdentityLinkPlanInput): IdentityLinkPlan {
    const userById = new Map(users.map((user) => [user.id, user]));
    const duplicateUsers = repeated(rows.map((row) => row.userId));
    const duplicateSubjects = repeated(rows.map((row) => row.auth0Sub));
    const ownerBySubject = new Map(existing.map((identity) => [identity.subject, identity.userId]));
    const usersWithIdentity = new Set(existing.map((identity) => identity.userId));

    const plan: IdentityLinkPlan = { toLink: [], alreadyLinked: [], refused: [] };

    for (const row of rows) {
        const refuse = (reason: IdentityLinkRefusal): void => {
            plan.refused.push({ line: row.line, userId: row.userId, reason });
        };
        const planned: PlannedIdentity = { userId: row.userId, issuer, subject: row.auth0Sub };
        const user = userById.get(row.userId);

        if (duplicateUsers.has(row.userId) || duplicateSubjects.has(row.auth0Sub)) {
            refuse('duplicate_in_list');
        } else if (!user) {
            refuse('user_not_found');
        } else if (ownerBySubject.get(row.auth0Sub) === row.userId) {
            plan.alreadyLinked.push(planned);
        } else if (!user.isActive) {
            refuse('user_inactive');
        } else if (!user.emailConfirmed) {
            refuse('local_email_unconfirmed');
        } else if (!row.auth0EmailVerified) {
            refuse('auth0_email_unverified');
        } else if (user.email.toLowerCase() !== row.auth0Email.toLowerCase()) {
            refuse('email_mismatch');
        } else if (ownerBySubject.has(row.auth0Sub)) {
            refuse('subject_mapped_to_other_user');
        } else if (usersWithIdentity.has(row.userId)) {
            refuse('user_has_other_identity');
        } else {
            plan.toLink.push(planned);
        }
    }

    return plan;
}
