import { buildHttpErrorBody, extractHttpExceptionMessage } from '@/common/http/error-response.util';
import { WinstonLogger } from '@/common/logger/winston.logger';
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
            path: request.originalUrl,
            requestId: request.requestId,
        };
        if (process.env.NODE_ENV !== 'production' && request.body !== undefined) {
            meta.body = request.body;
        }

        const logMessage = typeof message === 'string' ? message : message.join('; ');

        if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR.valueOf()) {
            this.logger.logError(logMessage, exception.stack, meta);
        } else {
            this.logger.logWarn(logMessage, meta);
        }

        response.status(statusCode).json(body);
    }
}
