import { timingSafeEqual } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

const BASIC_SCHEME = 'Basic';
const BASIC_CHALLENGE = 'Basic realm="admin"';

/** Constant-time comparison; differing lengths fail fast without leaking which character differed. */
function safeEqual(actual: string, expected: string): boolean {
    const actualBuffer = Buffer.from(actual);
    const expectedBuffer = Buffer.from(expected);

    return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function readBasicCredentials(authorization: string | undefined): { user: string; password: string } | undefined {
    const [scheme, encoded] = (authorization ?? '').split(' ');

    if (scheme !== BASIC_SCHEME || !encoded) {
        return undefined;
    }

    // Only the first colon separates user from password; the password may contain colons.
    const [user = '', ...passwordParts] = Buffer.from(encoded, 'base64').toString().split(':');

    return { user, password: passwordParts.join(':') };
}

/**
 * Guards a route with HTTP basic auth.
 *
 * Missing credentials in config answer 404, not open access: the protected route
 * stays hidden until it is configured.
 */
export function createBasicAuthMiddleware(user?: string, password?: string) {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!user || !password) {
            res.status(404).end();
            return;
        }

        const credentials = readBasicCredentials(req.headers.authorization);

        if (credentials && safeEqual(credentials.user, user) && safeEqual(credentials.password, password)) {
            next();
            return;
        }

        res.setHeader('WWW-Authenticate', BASIC_CHALLENGE).status(401).end();
    };
}
