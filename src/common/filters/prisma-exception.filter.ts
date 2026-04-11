import { buildHttpErrorBody } from '@/common/http/error-response.util';
import { WinstonLogger } from '@/common/logger/winston.logger';
import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';

@Catch(Prisma.PrismaClientKnownRequestError, Prisma.PrismaClientUnknownRequestError, Prisma.PrismaClientValidationError)
export class PrismaExceptionFilter implements ExceptionFilter {
    public constructor(private readonly logger: WinstonLogger) {}

    public catch(exception: Prisma.PrismaClientKnownRequestError | Prisma.PrismaClientUnknownRequestError | Prisma.PrismaClientValidationError, host: ArgumentsHost): void {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();

        const { statusCode, message, prismaCode } = this.mapException(exception);

        const body = buildHttpErrorBody(statusCode, message, request);

        const meta: Record<string, unknown> = {
            statusCode,
            method: request.method,
            path: request.originalUrl,
            requestId: request.requestId,
            prismaCode,
        };
        if (process.env.NODE_ENV !== 'production' && request.body !== undefined) {
            meta.body = request.body;
        }

        if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR.valueOf()) {
            this.logger.logError(message, exception.stack, meta);
        } else {
            this.logger.logWarn(message, meta);
        }

        response.status(statusCode).json(body);
    }

    private mapException(exception: Prisma.PrismaClientKnownRequestError | Prisma.PrismaClientUnknownRequestError | Prisma.PrismaClientValidationError): {
        statusCode: number;
        message: string;
        prismaCode?: string;
    } {
        if (exception instanceof Prisma.PrismaClientValidationError) {
            return {
                statusCode: HttpStatus.BAD_REQUEST,
                message: 'Invalid request data',
                prismaCode: 'validation',
            };
        }

        if (exception instanceof Prisma.PrismaClientUnknownRequestError) {
            return {
                statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
                message: 'Database request failed',
                prismaCode: 'unknown',
            };
        }

        const code = exception.code;
        switch (code) {
            case 'P2002': {
                const target = exception.meta?.target;
                const fields = Array.isArray(target) ? target.join(', ') : target !== undefined && target !== null ? String(target) : 'unknown';
                return {
                    statusCode: HttpStatus.CONFLICT,
                    message: `Unique constraint violation on: ${fields}`,
                    prismaCode: code,
                };
            }
            case 'P2025': {
                const cause = (exception.meta as { cause?: unknown } | undefined)?.cause;
                const msg = typeof cause === 'string' ? cause : 'Record not found';
                return {
                    statusCode: HttpStatus.NOT_FOUND,
                    message: msg,
                    prismaCode: code,
                };
            }
            case 'P2003':
                return {
                    statusCode: HttpStatus.CONFLICT,
                    message: 'Foreign key constraint violation',
                    prismaCode: code,
                };
            case 'P2014':
                return {
                    statusCode: HttpStatus.CONFLICT,
                    message: 'Relation violation',
                    prismaCode: code,
                };
            default:
                return {
                    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
                    message: 'An unexpected database error occurred',
                    prismaCode: code,
                };
        }
    }
}
