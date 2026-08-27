/**
 * Flush the Sentry queue when the process is asked to stop.
 *
 * Docker sends SIGTERM on every rolling deploy. Without this flush each deploy
 * discards whatever is still buffered — which is precisely the set of errors
 * most likely to be about the deploy itself.
 *
 * This handler does NOT exit the process. NestJS installs its own shutdown
 * handling to drain in-flight requests, and a process.exit() here would race
 * it, truncating responses on every deploy. Node runs every registered
 * listener, so flushing alongside is enough: the 5s flush fits inside a
 * standard 30s grace period, and Nest owns the exit.
 */
import * as Sentry from '@sentry/nestjs';

const FLUSH_TIMEOUT_MS = 5000;

let registered = false;

export function registerSentryShutdown(): void {
    if (registered) {
        return;
    }
    registered = true;

    const flush = async (): Promise<void> => {
        try {
            await Sentry.close(FLUSH_TIMEOUT_MS);
        } catch {
            // Never let the reporting path affect shutdown.
        }
    };

    process.once('SIGTERM', () => void flush());
    process.once('SIGINT', () => void flush());
}

registerSentryShutdown();
