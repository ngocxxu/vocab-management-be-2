/// <reference path="./types/express.d.ts" />
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { nanoid } from 'nanoid';

import { ApplicationModule } from './app/application.module';
import { HttpExceptionFilter, PrismaExceptionFilter } from './common/filters';
import { buildHttpErrorBody } from './common/http/error-response.util';
import { WinstonLogger } from './common/logger/winston.logger';
import { SharedModule, LogInterceptor } from './shared';

const API_DEFAULT_PORT = 3002;
const API_DEFAULT_PREFIX = '/api/v1/';

const SWAGGER_TITLE = 'Passenger API';
const SWAGGER_DESCRIPTION = 'API used for passenger management';

const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024;
const DEFAULT_REQUEST_TIMEOUT = 5 * 60 * 1000;

function parseIntEnv(key: string, defaultValue: number): number {
    return parseInt(process.env[key] || defaultValue.toString(), 10);
}

function getFileSizeInMB(bytes: number): number {
    return Math.round(bytes / 1024 / 1024);
}

function getCorsOptions() {
    const isDevelopment = process.env.NODE_ENV !== 'production';
    const allowedOrigins = process.env.API_CORS_ORIGINS?.split(',') || [];

    const commonHeaders = ['Content-Type', 'X-Requested-With'];

    if (isDevelopment) {
        return {
            origin: true,
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
            allowedHeaders: commonHeaders,
        };
    }

    return {
        origin: allowedOrigins.length > 0 ? allowedOrigins : false,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: commonHeaders,
    };
}

function createSwagger(app: INestApplication) {
    const options = new DocumentBuilder().setTitle(SWAGGER_TITLE).setDescription(SWAGGER_DESCRIPTION).addBearerAuth().build();

    const document = SwaggerModule.createDocument(app, options);
    SwaggerModule.setup(process.env.SWAGGER_PREFIX || '/', app, document);
}

function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
    const header = req.headers['x-request-id'];
    const fromHeader = typeof header === 'string' ? header : Array.isArray(header) ? header[0] : undefined;
    const trimmed = fromHeader?.trim();
    req.requestId = trimmed && trimmed.length > 0 ? trimmed : `req_${Date.now()}_${nanoid(7)}`;
    next();
}

function createMulterMiddleware(maxFileSize: number, winstonLogger: WinstonLogger) {
    const upload = multer({
        storage: multer.memoryStorage(),
        limits: {
            fileSize: maxFileSize,
            fieldSize: maxFileSize,
        },
    }).single('file');

    return (req: Request, res: Response, next: NextFunction): void => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        upload(req, res, (err: unknown) => {
            if (err) {
                if (err instanceof multer.MulterError) {
                    if (err.code === 'LIMIT_FILE_SIZE') {
                        winstonLogger.logWarn(`File size limit exceeded: ${req.method} ${req.path}`, {
                            statusCode: 413,
                            method: req.method,
                            path: req.originalUrl,
                            requestId: req.requestId,
                        });
                        const detail = `File size exceeds the maximum allowed limit of ${maxFileSize} bytes (${getFileSizeInMB(maxFileSize)}MB)`;
                        return res.status(413).json(buildHttpErrorBody(413, detail, req));
                    }
                    winstonLogger.logError(`Multer error: ${err.code} - ${err.message}`, undefined, {
                        statusCode: 400,
                        method: req.method,
                        path: req.originalUrl,
                        requestId: req.requestId,
                    });
                    return res.status(400).json(buildHttpErrorBody(400, err.message, req));
                }
                const errorMessage = err instanceof Error ? err.message : 'Unknown error';
                winstonLogger.logError(`File upload error: ${errorMessage}`, undefined, {
                    method: req.method,
                    path: req.originalUrl,
                    requestId: req.requestId,
                });
                return next(err);
            }
            next();
        });
    };
}

function createTimeoutMiddleware(timeoutMs: number, winstonLogger: WinstonLogger) {
    return (req: Request, res: Response, next: NextFunction): void => {
        req.setTimeout(timeoutMs, () => {
            winstonLogger.logWarn(`Request timeout after ${timeoutMs}ms: ${req.method} ${req.path}`, {
                statusCode: 408,
                method: req.method,
                path: req.originalUrl,
                requestId: req.requestId,
            });
            if (!res.headersSent) {
                res.status(408).json(buildHttpErrorBody(408, 'Request took too long to process', req));
            }
        });
        next();
    };
}

async function bootstrap(): Promise<void> {
    const app = await NestFactory.create(ApplicationModule, {
        bufferLogs: true,
        logger: false,
    });

    const winstonLogger = app.get(WinstonLogger);
    app.useLogger(winstonLogger);

    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
        }),
    );

    app.useGlobalFilters(new PrismaExceptionFilter(winstonLogger), new HttpExceptionFilter(winstonLogger));

    app.enableCors(getCorsOptions());

    app.use(requestIdMiddleware);

    const maxFileSize = parseIntEnv('MAX_FILE_SIZE', DEFAULT_MAX_FILE_SIZE);
    const requestTimeout = parseIntEnv('REQUEST_TIMEOUT', DEFAULT_REQUEST_TIMEOUT);

    app.use(createMulterMiddleware(maxFileSize, winstonLogger));

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    const expressApp = app.getHttpAdapter().getInstance();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    expressApp.use(createTimeoutMiddleware(requestTimeout, winstonLogger));

    app.setGlobalPrefix(process.env.API_PREFIX || API_DEFAULT_PREFIX);

    if (!process.env.SWAGGER_ENABLE || process.env.SWAGGER_ENABLE === '1') {
        createSwagger(app);
    }

    const logInterceptor = app.select(SharedModule).get(LogInterceptor);
    app.useGlobalInterceptors(logInterceptor);

    const port = process.env.API_PORT || API_DEFAULT_PORT;
    const host = '0.0.0.0';
    await app.listen(port, host);

    winstonLogger.log(`Application is running on: http://${host}:${port}`);
}

bootstrap().catch((err: unknown) => {
    const fatal = new WinstonLogger();
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    fatal.logError(message, stack, { phase: 'bootstrap' });
    process.exit(1);
});
