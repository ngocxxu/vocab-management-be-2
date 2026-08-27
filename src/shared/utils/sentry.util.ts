import * as Sentry from '@sentry/nestjs';

type SentryPrimitive = string | number | boolean | bigint | symbol | null | undefined;
type SentryContext = Record<string, unknown>;

interface CaptureSentryExceptionOptions {
    tags?: Record<string, SentryPrimitive>;
    contexts?: Record<string, SentryContext>;
}

/**
 * Reduce a request URL to its path, dropping the query string.
 *
 * Query strings carry tokens, signed URL parameters and search terms, so they
 * must never reach Sentry or the log sinks.
 *
 * Note: src/instrument.ts keeps its own copy of this on purpose — it runs
 * before the Nest container exists and must not import application modules.
 */
export function toPathWithoutQuery(url: string): string {
    const queryStart = url.indexOf('?');

    return queryStart === -1 ? url : url.slice(0, queryStart);
}

export function captureSentryException(error: unknown, options: CaptureSentryExceptionOptions = {}): void {
    Sentry.withScope((scope) => {
        for (const [key, value] of Object.entries(options.tags ?? {})) {
            scope.setTag(key, value);
        }

        for (const [key, value] of Object.entries(options.contexts ?? {})) {
            scope.setContext(key, value);
        }

        Sentry.captureException(error);
    });
}
