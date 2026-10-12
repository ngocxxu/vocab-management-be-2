import type { NextFunction, Request, Response } from 'express';

// Stub so the RED spec compiles; the real behaviour lands in the GREEN commit.
/* eslint-disable @typescript-eslint/no-unused-vars */
export function createBasicAuthMiddleware(_user?: string, _password?: string) {
    return (_req: Request, _res: Response, _next: NextFunction): void => {
        throw new Error('not implemented');
    };
}
