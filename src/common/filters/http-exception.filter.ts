import { buildHttpErrorBody, extractHttpExceptionMessage } from '@/common/http/error-response.util';
import { WinstonLogger } from '@/common/logger/winston.logger';
import { captureSentryException, toPathWithoutQuery } from '@/shared/utils/sentry.util';
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
    public constructor(private readonly logger: WinstonLogger) {}

    public catch(exception: HttpException, host: ArgumentsHost): void {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();
        const statusCode = exception.getStatus();
        const raw = exception.getResponse();
        const message = extractHttpExceptionMessage(typeof raw === 'string' || typeof raw === 'object' ? (raw as string | Record<string, unknown>) : { message: String(raw) });
        const body = buildHttpErrorBody(statusCode, message, request);

        const meta: Record<string, unknown> = {
            statusCode,
            method: request.method,
            path: toPathWithoutQuery(request.originalUrl),
            requestId: request.requestId,
        };
        if (process.env.NODE_ENV !== 'production' && request.body !== undefined) {
            meta.body = request.body;
        }

        const logMessage = typeof message === 'string' ? message : message.join('; ');

        if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR.valueOf()) {
            this.logger.logError(logMessage, exception.stack, meta);
            // SentryGlobalFilter treats EVERY HttpException as expected —
            // isExpectedError() ignores the status code entirely — and this
            // filter runs first anyway. Without this call a 5xx thrown as an
            // HttpException (AiGenerationException, for one) reaches Sentry
            // from nowhere at all. 4xx deliberately stays out: expected
            // traffic, not a fault.
            captureSentryException(exception, {
                tags: { 'http.status_code': statusCode },
                contexts: { http_exception: meta },
            });
        } else {
            this.logger.logWarn(logMessage, meta);
        }

        response.status(statusCode).json(body);
    }
}
