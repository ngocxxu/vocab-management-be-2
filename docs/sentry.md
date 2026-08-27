# Sentry

## The switch rule

**The DSN says _where_ events go. It never says _whether_.** Capture is
controlled by `SENTRY_ENABLED`, resolved in `src/instrument.ts`.

| Variable                    | Meaning                                                   |
| --------------------------- | --------------------------------------------------------- |
| `SENTRY_ENABLED`            | The only capture switch. Must be the exact string `true`. |
| `SENTRY_DSN`                | Destination only. Never a switch.                         |
| `SENTRY_ENVIRONMENT`        | Label. Falls back to `NODE_ENV`.                          |
| `SENTRY_TRACES_SAMPLE_RATE` | Overrides the default of `0`.                             |
| `SENTRY_DEBUG`              | SDK debug logging.                                        |

Only the exact string `true` enables capture — never a truthiness check, or
`SENTRY_ENABLED=false` would mean enabled.

A switch turned on with an empty DSN warns once via `process.emitWarning` and
stays disabled. That combination is a misconfiguration, not an off state: the
SDK would initialise and then silently discard every event.

`Sentry.init` is called **unconditionally**, with the decision carried by the
`enabled` option. Never wrap it in an `if` — skipping the call means the SDK's
async-context isolation never installs, so scope behaviour differs between
enabled and disabled deployments in a way that only surfaces in production.

`src/instrument.ts` reads `process.env` directly and imports no application
module. It runs before the Nest container exists; that is the point of the
file. `app.config.ts` exposes `sentryEnabled` for anything inside the container.

## Scrubbing

`beforeSend` rebuilds every event from a **named allowlist**. Never convert this
to a denylist: a denylist leaks whatever field the next SDK version starts
attaching, silently and without a code change.

Query strings are stripped from the request path before it reaches the Sentry
scope, and from the Winston log metadata in the multer and timeout middleware.
They carry tokens, signed URL parameters and search terms.

The request path is a **context**, never a tag. Tags are indexed and
cardinality-limited; per-record paths would exhaust that budget and fragment
issue grouping. `request_id` is a tag, which is fine — it is bounded per request
and useful for correlation.

## Shutdown

`src/sentry-shutdown.ts` flushes the queue on SIGTERM and SIGINT with a
five-second timeout. It deliberately does **not** call `process.exit`: NestJS
installs its own shutdown handling to drain in-flight requests, and exiting here
would race that drain and truncate responses on every deploy.

## What SentryGlobalFilter actually reports

Established by reading the installed SDK (`@sentry/nestjs` 10.x,
`build/cjs/helpers.js`), not assumed:

`isExpectedError` returns `true` for **any** `HttpException`, regardless of its
status code. `SentryGlobalFilter` therefore reports neither 4xx nor 5xx
`HttpException`s. It captures only errors that are not `HttpException`s —
unhandled `TypeError`s, thrown non-Error values, and similar.

Two consequences:

1. **No 4xx noise filter is needed.** Expected 4xx traffic never reaches Sentry,
   so there is no status check to add to `beforeSend`.
2. **Deliberate 5xx are invisible.** `throw new InternalServerErrorException(…)`
   and `ServiceUnavailableException` are not reported. `HttpExceptionFilter`
   catches them first and does not report to Sentry either.

Point 2 is a real gap and is _not_ addressed here — closing it means adding
capture, which is a different change from hardening what already gets sent. If
deliberate 5xx should be visible, the place to do it is `HttpExceptionFilter`,
gated on `getStatus() >= 500`, using `captureSentryException` from
`src/shared/utils/sentry.util.ts`.

## Free-plan constraints

5,000 errors/month, no spike protection. `tracesSampleRate` defaults to `0` on
both development and production; `SENTRY_TRACES_SAMPLE_RATE` still overrides it
for a one-off investigation. The Prisma integration stays wired — it costs
nothing at a zero sample rate.
