import { INestApplication, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Request, Response, NextFunction } from 'express';
import * as multer from 'multer';

import { ApplicationModule } from './modules/app.module';
import { CommonModule, LogInterceptor } from './modules/common';

/**
 * These are API defaults that can be changed using environment variables,
 * it is not required to change them (see the `.env.example` file)
 */
const API_DEFAULT_PORT = 3002;
const API_DEFAULT_PREFIX = '/api/v1/';

/**
 * The defaults below are dedicated to Swagger configuration, change them
 * following your needs (change at least the title & description).
 *
 * @todo Change the constants below following your API requirements
 */
const SWAGGER_TITLE = 'Passenger API';
const SWAGGER_DESCRIPTION = 'API used for passenger management';
const SWAGGER_PREFIX = '/docs';

const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB in bytes
const DEFAULT_REQUEST_TIMEOUT = 5 * 60 * 1000; // 5 minutes in milliseconds

/**
 * Parse integer from environment variable with default value
 */
function parseIntEnv(key: string, defaultValue: number): number {
    return parseInt(process.env[key] || defaultValue.toString(), 10);
}

/**
 * Create standardized error response
 */
function createErrorResponse(statusCode: number, message: string, error: string) {
    return {
        statusCode,
        message,
        error,
    };
}

/**
 * Get file size in MB for display
 */
function getFileSizeInMB(bytes: number): number {
    return Math.round(bytes / 1024 / 1024);
}

/**
 * Get CORS configuration based on environment
 */
function getCorsOptions() {
    const isDevelopment = process.env.NODE_ENV !== 'production';
    const allowedOrigins = process.env.API_CORS_ORIGINS?.split(',') || [];

    if (isDevelopment) {
        return {
            origin: true, // Allow all origins in development
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'X-Requested-With'],
        };
    }

    return {
        origin: allowedOrigins.length > 0 ? allowedOrigins : false,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'X-Requested-With'],
    };
}

/**
 * Register a Swagger module in the NestJS application.
 * This method mutates the given `app` to register a new module dedicated to
 * Swagger API documentation. Any request performed on `SWAGGER_PREFIX` will
 * receive a documentation page as response.
 *
 * @todo See the `nestjs/swagger` NPM package documentation to customize the
 *       code below with API keys, security requirements, tags and more.
 */
function createSwagger(app: INestApplication) {
    const options = new DocumentBuilder()
        .setTitle(SWAGGER_TITLE)
        .setDescription(SWAGGER_DESCRIPTION)
        .addBearerAuth()
        .build();

    const document = SwaggerModule.createDocument(app, options);
    SwaggerModule.setup(SWAGGER_PREFIX, app, document);
}

/**
 * Build & bootstrap the NestJS API.
 * This method is the starting point of the API; it registers the application
 * module and registers essential components such as the logger and request
 * parsing middleware.
 */
/**
 * Configure multer file upload middleware with error handling
 */
function createMulterMiddleware(maxFileSize: number) {
    const logger = new Logger('Multer');
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
                        logger.warn(`File size limit exceeded: ${req.method} ${req.path}`);
                        return res
                            .status(413)
                            .json(
                                createErrorResponse(
                                    413,
                                    'File too large',
                                    `File size exceeds the maximum allowed limit of ${maxFileSize} bytes (${getFileSizeInMB(
                                        maxFileSize,
                                    )}MB)`,
                                ),
                            );
                    }
                    logger.error(`Multer error: ${err.code} - ${err.message}`);
                    return res
                        .status(400)
                        .json(createErrorResponse(400, 'File upload error', err.message));
                }
                const errorMessage = err instanceof Error ? err.message : 'Unknown error';
                logger.error(`File upload error: ${errorMessage}`);
                return next(err);
            }
            next();
        });
    };
}

/**
 * Configure request timeout middleware
 */
function createTimeoutMiddleware(timeoutMs: number) {
    const logger = new Logger('RequestTimeout');
    return (req: Request, res: Response, next: NextFunction): void => {
        req.setTimeout(timeoutMs, () => {
            logger.warn(`Request timeout after ${timeoutMs}ms: ${req.method} ${req.path}`);
            if (!res.headersSent) {
                res.status(408).json(
                    createErrorResponse(408, 'Request timeout', 'Request took too long to process'),
                );
            }
        });
        next();
    };
}

async function bootstrap(): Promise<void> {
    const app = await NestFactory.create(ApplicationModule, {
        logger: ['error', 'warn', 'log'],
    });

    const maxFileSize = parseIntEnv('MAX_FILE_SIZE', DEFAULT_MAX_FILE_SIZE);
    const requestTimeout = parseIntEnv('REQUEST_TIMEOUT', DEFAULT_REQUEST_TIMEOUT);

    // Configure multer for file uploads with size limits
    app.use(createMulterMiddleware(maxFileSize));

    // Configure server timeouts for long-running requests
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    const expressApp = app.getHttpAdapter().getInstance();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    expressApp.use(createTimeoutMiddleware(requestTimeout));

    // @todo Enable Helmet for better API security headers

    app.setGlobalPrefix(process.env.API_PREFIX || API_DEFAULT_PREFIX);

    if (!process.env.SWAGGER_ENABLE || process.env.SWAGGER_ENABLE === '1') {
        createSwagger(app);
    }

    const logInterceptor = app.select(CommonModule).get(LogInterceptor);
    app.useGlobalInterceptors(logInterceptor);

    // Enable CORS with environment-based configuration
    app.enableCors(getCorsOptions());

    const port = process.env.API_PORT || API_DEFAULT_PORT;
    const host = '0.0.0.0';
    await app.listen(port, host);

    // eslint-disable-next-line no-console
    console.info(`Application is running on: http://${host}:${port}`);
}

/**
 * It is now time to turn the lights on!
 * Any major error that can not be handled by NestJS will be caught in the code
 * below. The default behavior is to display the error on stdout and quit.
 *
 * @todo It is often advised to enhance the code below with an exception-catching
 *       service for better error handling in production environments.
 */
bootstrap().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);

    const defaultExitCode = 1;
    process.exit(defaultExitCode);
});
