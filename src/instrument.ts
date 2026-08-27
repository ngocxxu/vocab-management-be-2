import { PrismaInstrumentation } from '@prisma/instrumentation';
import * as Sentry from '@sentry/nestjs';
import { readFileSync } from 'fs';
import { join } from 'path';

interface PackageJson {
    version?: unknown;
}

// Off by default on the Sentry free plan: tracing competes with error capture
// for a quota that has no spike protection behind it. SENTRY_TRACES_SAMPLE_RATE
// still overrides, so tracing can be switched on for a single investigation
// without a code change.
const DEFAULT_DEVELOPMENT_TRACES_SAMPLE_RATE = 0;
const DEFAULT_PRODUCTION_TRACES_SAMPLE_RATE = 0;

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

/**
 * Reduce a URL to its path, dropping the query string. Duplicated from
 * server.ts deliberately: instrument.ts must not import application modules,
 * because it runs before anything else is loaded.
 */
function toPathWithoutQuery(url: string): string {
    const queryStart = url.indexOf('?');

    return queryStart === -1 ? url : url.slice(0, queryStart);
}

function getEnvironment(): string {
    const sentryEnvironment = process.env.SENTRY_ENVIRONMENT?.trim();

    return sentryEnvironment && sentryEnvironment.length > 0 ? sentryEnvironment : (process.env.NODE_ENV ?? 'development');
}

/**
 * Capture switch. Only the exact string 'true' enables it — the DSN says WHERE
 * events go, never WHETHER. Read from process.env directly because this module
 * runs before the Nest container exists; that is the whole point of the file.
 */
const sentryEnabled = process.env.SENTRY_ENABLED === 'true';
const sentryDsn = process.env.SENTRY_DSN ?? '';

/**
 * A switch turned on with no destination is a misconfiguration, not an off
 * state: the SDK would initialise and then silently discard every event.
 */
if (sentryEnabled && !sentryDsn) {
    // process.emitWarning rather than console.warn: this module runs before the
    // Nest logger exists, and console is banned by lint in this repo.
    process.emitWarning('[sentry] SENTRY_ENABLED=true but SENTRY_DSN is missing; capture disabled');
}

const sentryActive = sentryEnabled && sentryDsn.length > 0;

/**
 * Rebuild the outgoing event from named fields only. Anything not listed is
 * dropped.
 *
 * An allowlist and not a denylist on purpose: a denylist silently leaks
 * whatever field the next SDK version starts attaching.
 */
function applyAllowlist(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
    const pathname = event.request?.url ? toPathWithoutQuery(event.request.url) : undefined;

    return {
        type: event.type,
        event_id: event.event_id,
        timestamp: event.timestamp,
        platform: event.platform,
        level: event.level,
        environment: event.environment,
        release: event.release,
        server_name: event.server_name,
        transaction: event.transaction,
        fingerprint: event.fingerprint,
        exception: event.exception,
        tags: { ...event.tags, runtime: 'server' },
        contexts: {
            // Custom contexts pass through. The allowlist exists to stop the
            // SDK auto-attaching fields we never inspected; contexts are only
            // ever set by our own code at explicit call sites (queue_job,
            // reminder_email_failure, request_metadata), so that risk does not
            // apply and dropping them silently destroys debugging data.
            ...event.contexts,
            // Always overridden, never inherited: the scrubbed pathname wins.
            // A context and not a tag, because per-record paths would exhaust
            // the tag cardinality budget and fragment issue grouping.
            request: pathname ? { pathname } : undefined,
        },
        request: event.request?.method ? { method: event.request.method } : undefined,
        sdk: event.sdk,
    } as Sentry.ErrorEvent;
}

/** Guards against an error thrown inside the capture path looping forever. */
let capturing = false;

const packageVersion = getPackageVersion();

Sentry.init({
    dsn: sentryDsn,

    // Carries the decision. The init call itself is unconditional: initialising
    // with `enabled: false` still installs the SDK's async-context isolation, so
    // scope behaviour is identical whether or not we are sending.
    enabled: sentryActive,
    environment: getEnvironment(),
    release: packageVersion ? `vocab-management-be@${packageVersion}` : undefined,
    tracesSampleRate: getTracesSampleRate(),
    debug: process.env.SENTRY_DEBUG === 'true',
    beforeSend(event) {
        if (!sentryActive || capturing) {
            return null;
        }

        capturing = true;
        try {
            return applyAllowlist(event);
        } finally {
            capturing = false;
        }
    },
    integrations: [
        Sentry.prismaIntegration({
            prismaInstrumentation: new PrismaInstrumentation(),
        }),
    ],
});
