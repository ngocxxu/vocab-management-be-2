import * as Sentry from '@sentry/nestjs';

type SentryPrimitive = string | number | boolean | bigint | symbol | null | undefined;
type SentryContext = Record<string, unknown>;

interface CaptureSentryExceptionOptions {
    tags?: Record<string, SentryPrimitive>;
    contexts?: Record<string, SentryContext>;
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
