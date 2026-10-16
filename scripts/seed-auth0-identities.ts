/**
 * One-off: map existing Supabase Google logins to their original Users as Identity rows (issue #30).
 *
 *   dry run (default, writes nothing):  pnpm auth0:seed-identities
 *   write:                               pnpm auth0:seed-identities --write
 *
 * Run once per environment with that environment's variables (dev: `env-cmd -f .env pnpm auth0:seed-identities`):
 *   AUTH0_ISSUER                 the tenant's issuer for this environment, e.g. https://vocab-development.jp.auth0.com/
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   read Supabase's own identity records (admin API)
 *   DATABASE_URL                 the Vocab database that receives the Identity rows
 *
 * Matching uses `users.supabase_user_id` only. Email is never read or printed. Re-running changes nothing.
 */
import { createClient } from '@supabase/supabase-js';
import { PrismaClient } from '@prisma/client';

// Relative on purpose: plain ts-node does not resolve the `@/` alias (tsc-alias only runs in the build).
import { planGoogleIdentities, SupabaseGoogleUser } from '../src/domains/identity/user/utils';

const PAGE_SIZE = 1000;

const out = (line = ''): void => {
    process.stdout.write(`${line}\n`);
};

function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`${name} is required`);
    }
    return value;
}

async function loadSupabaseGoogleUsers(): Promise<SupabaseGoogleUser[]> {
    const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
    const users: SupabaseGoogleUser[] = [];
    let page: number | null = 1;
    while (page !== null) {
        const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PAGE_SIZE });
        if (error) {
            throw new Error(`Supabase listUsers failed: ${error.message}`);
        }
        for (const user of data.users) {
            const googleIdentities = (user.identities ?? [])
                .filter((identity) => identity.provider === 'google')
                .map((identity) => ({
                    providerId: identity.id,
                    subClaim: typeof identity.identity_data?.sub === 'string' ? identity.identity_data.sub : undefined,
                }));
            users.push({ supabaseUserId: user.id, googleIdentities });
        }
        // Follow the server's own next page instead of guessing from the page size: a smaller server-side cap would otherwise truncate silently.
        page = data.nextPage;
        if (page === null && typeof data.total === 'number' && users.length !== data.total) {
            throw new Error(`Supabase returned ${users.length} users but reports ${data.total}; refusing to continue with a partial list`);
        }
    }
    return users;
}

async function main(): Promise<void> {
    const write = process.argv.includes('--write');
    const rawIssuer = requireEnv('AUTH0_ISSUER');
    const issuer = rawIssuer.endsWith('/') ? rawIssuer : `${rawIssuer}/`;
    const prisma = new PrismaClient();

    try {
        const [supabaseUsers, localUsers, existing, localWithoutSupabaseId] = await Promise.all([
            loadSupabaseGoogleUsers(),
            prisma.user.findMany({ where: { supabaseUserId: { not: null } }, select: { id: true, supabaseUserId: true } }),
            prisma.userIdentity.findMany({ where: { issuer }, select: { userId: true, subject: true } }),
            prisma.user.count({ where: { supabaseUserId: null } }),
        ]);

        const plan = planGoogleIdentities({
            issuer,
            supabaseUsers,
            localUsers: localUsers.flatMap((user) => (user.supabaseUserId ? [{ id: user.id, supabaseUserId: user.supabaseUserId }] : [])),
            existing,
        });

        const googleUsers = supabaseUsers.filter((user) => user.googleIdentities.length > 0).length;
        out(`Mode:                        ${write ? 'WRITE' : 'DRY RUN (nothing is written)'}`);
        out(`Issuer:                      ${issuer}`);
        out(`Supabase users total:        ${supabaseUsers.length}`);
        out(`  with a Google identity:    ${googleUsers}`);
        const mapped = plan.alreadyMapped.length + plan.toCreate.length;
        out(`Mapped (existing + new):     ${mapped}`);
        out(`  already mapped:            ${plan.alreadyMapped.length}`);
        out(`${write ? 'To create' : 'Would create'}:`.padEnd(29) + `${plan.toCreate.length}`);
        out(`Unmapped (no local user):    ${plan.unmapped.length}`);
        out(`Ambiguous (skipped):         ${plan.ambiguous.length}`);
        for (const entry of [...plan.unmapped, ...plan.ambiguous]) {
            out(`  - supabase user ${entry.supabaseUserId}: ${entry.reason}`);
        }
        out(`Local users without a Supabase id (cannot be Google-mapped): ${localWithoutSupabaseId}`);
        if (googleUsers !== mapped + plan.unmapped.length + plan.ambiguous.length) {
            out('WARNING: Google users do not reconcile with mapped + unmapped + ambiguous; do not trust this run');
        }

        if (write) {
            const { count } = await prisma.userIdentity.createMany({ data: plan.toCreate, skipDuplicates: true });
            out(`Created: ${count}`);
            if (count !== plan.toCreate.length) {
                out(`WARNING: planned ${plan.toCreate.length} but created ${count}; a concurrent login may have mapped some. Re-run the dry run to see why.`);
            }
        }
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
});
