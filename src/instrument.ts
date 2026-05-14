import { PrismaInstrumentation } from '@prisma/instrumentation';
import * as Sentry from '@sentry/nestjs';
import { readFileSync } from 'fs';
import { join } from 'path';

interface PackageJson {
    version?: unknown;
}

const DEFAULT_DEVELOPMENT_TRACES_SAMPLE_RATE = 1;
const DEFAULT_PRODUCTION_TRACES_SAMPLE_RATE = 0.1;

function getPackageVersion(): string | undefined {
    try {
        const raw = readFileSync(join(process.cwd(), 'package.json'), 'utf8');
        const parsed = JSON.parse(raw) as PackageJson;

        return typeof parsed.version === 'string' && parsed.version.trim().length > 0 ? parsed.version : undefined;
    } catch {
        return undefined;
    }
}

function getTracesSampleRate(): number {
    const configured = process.env.SENTRY_TRACES_SAMPLE_RATE;
    if (configured !== undefined && configured.trim().length > 0) {
        const parsed = Number(configured);
        if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) {
            return parsed;
        }
    }

    return process.env.NODE_ENV === 'production' ? DEFAULT_PRODUCTION_TRACES_SAMPLE_RATE : DEFAULT_DEVELOPMENT_TRACES_SAMPLE_RATE;
}

function getEnvironment(): string {
    const sentryEnvironment = process.env.SENTRY_ENVIRONMENT?.trim();

    return sentryEnvironment && sentryEnvironment.length > 0 ? sentryEnvironment : (process.env.NODE_ENV ?? 'development');
}

const packageVersion = getPackageVersion();

Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: getEnvironment(),
    release: packageVersion ? `vocab-management-be@${packageVersion}` : undefined,
    tracesSampleRate: getTracesSampleRate(),
    debug: process.env.SENTRY_DEBUG === 'true',
    integrations: [
        Sentry.prismaIntegration({
            prismaInstrumentation: new PrismaInstrumentation(),
        }),
    ],
});
