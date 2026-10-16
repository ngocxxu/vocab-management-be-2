/**
 * One-off: link the few Supabase password users to their new Auth0 logins from an admin-reviewed list (issue #32).
 *
 *   dry run (default, writes nothing):  pnpm auth0:link-identities <list.csv>
 *   write:                               pnpm auth0:link-identities <list.csv> --write
 *
 * list.csv header: userId,auth0Sub,auth0Email,auth0EmailVerified   (see docs/runbooks/auth0-password-user-linking.md)
 * Env (per environment): AUTH0_ISSUER (that environment's tenant), DATABASE_URL.
 *
 * Nothing is matched by email. The admin picks each pair; email is only a safety check that both sides are verified
 * and are the same address. Rows that fail any check are refused and nothing is written for them.
 * Exit code: 0 all rows ok, 1 bad input or error, 2 some rows refused. Re-running changes nothing.
 */
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';

// Relative on purpose: plain ts-node does not resolve the `@/` alias (tsc-alias only runs in the build).
import { parseIdentityLinkCsv, planIdentityLinks } from '../src/domains/identity/user/utils';

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

async function main(): Promise<number> {
    const args = process.argv.slice(2);
    const write = args.includes('--write');
    const file = args.find((arg) => !arg.startsWith('--'));
    if (!file) {
        throw new Error('Usage: pnpm auth0:link-identities <list.csv> [--write]');
    }
    const rawIssuer = requireEnv('AUTH0_ISSUER');
    const issuer = rawIssuer.endsWith('/') ? rawIssuer : `${rawIssuer}/`;

    const { rows, errors } = parseIdentityLinkCsv(readFileSync(file, 'utf8'));
    if (errors.length > 0) {
        errors.forEach((error) => out(`  - ${error}`));
        throw new Error(`${file} has ${errors.length} invalid line(s); fix them and run again (nothing was written)`);
    }

    const userIds = rows.map((row) => row.userId);
    const subjects = rows.map((row) => row.auth0Sub);
    const prisma = new PrismaClient();
    try {
        const [users, existing] = await Promise.all([
            prisma.user.findMany({
                where: { id: { in: userIds } },
                select: { id: true, email: true, emailConfirmed: true, isActive: true },
            }),
            prisma.userIdentity.findMany({
                where: { issuer, OR: [{ userId: { in: userIds } }, { subject: { in: subjects } }] },
                select: { userId: true, subject: true },
            }),
        ]);

        const plan = planIdentityLinks({ issuer, rows, users, existing });

        out(`Mode:            ${write ? 'WRITE' : 'DRY RUN (nothing is written)'}`);
        out(`Issuer:          ${issuer}`);
        out(`Database host:   ${new URL(requireEnv('DATABASE_URL')).host}   (check it is the same environment as the issuer)`);
        out(`Rows in list:    ${rows.length}`);
        out(`Already linked:  ${plan.alreadyLinked.length}`);
        out(`${write ? 'To link' : 'Would link'}:`.padEnd(17) + `${plan.toLink.length}`);
        out(`Refused:         ${plan.refused.length}`);
        for (const refusal of plan.refused) {
            out(`  - line ${refusal.line}, user ${refusal.userId}: ${refusal.reason}`);
        }

        if (write) {
            const { count } = await prisma.userIdentity.createMany({ data: plan.toLink, skipDuplicates: true });
            out(`Linked: ${count}`);
            if (count !== plan.toLink.length) {
                out(`WARNING: planned ${plan.toLink.length} but linked ${count}; re-run the dry run to see why.`);
            }
        }
        return plan.refused.length > 0 ? 2 : 0;
    } finally {
        await prisma.$disconnect();
    }
}

main().then(
    (code) => process.exit(code),
    (error: unknown) => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exit(1);
    },
);
