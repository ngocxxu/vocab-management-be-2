import * as http from 'node:http';

import { Request } from 'express';

export interface StandardErrorBody {
    statusCode: number;
    error: string;
    message: string | string[];
    timestamp: string;
    path: string;
    requestId?: string;
}

export type RequestLike = Pick<Request, 'originalUrl' | 'method'> & { requestId?: string };

export function buildHttpErrorBody(
    statusCode: number,
    message: string | string[],
    req: RequestLike,
): StandardErrorBody {
    const errorName = http.STATUS_CODES[statusCode] ?? 'Error';
    const body: StandardErrorBody = {
        statusCode,
        error: errorName,
        message,
        timestamp: new Date().toISOString(),
        path: req.originalUrl ?? '/',
    };
    if (req.requestId) {
        body.requestId = req.requestId;
    }
    return body;
}

export function extractHttpExceptionMessage(response: string | Record<string, unknown>): string | string[] {
    if (typeof response === 'string') {
        return response;
    }
    const msg = response.message;
    if (Array.isArray(msg)) {
        return msg.filter((m): m is string => typeof m === 'string');
    }
    if (typeof msg === 'string') {
        return msg;
    }
    return 'Error';
}
