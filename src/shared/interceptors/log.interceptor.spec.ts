import { BadRequestException, ConflictException, ExecutionContext, InternalServerErrorException } from '@nestjs/common';
import { CallHandler } from '@nestjs/common';
import { of, throwError } from 'rxjs';

import { LoggerService } from '../services/logger.service';
import { LogInterceptor } from './log.interceptor';

describe('LogInterceptor', () => {
    const buildContext = (): ExecutionContext =>
        ({
            switchToHttp: () => ({
                getRequest: () => ({
                    method: 'POST',
                    ip: '10.0.0.1',
                    protocol: 'http',
                    hostname: 'vocab-be',
                    originalUrl: '/api/v1/auth/refresh',
                }),
            }),
        }) as unknown as ExecutionContext;

    const buildLogger = (): jest.Mocked<Pick<LoggerService, 'info' | 'warn' | 'error'>> => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    });

    const runFailing = async (logger: ReturnType<typeof buildLogger>, err: unknown): Promise<void> => {
        const interceptor = new LogInterceptor(logger as unknown as LoggerService);
        const next: CallHandler = { handle: () => throwError(() => err) };

        await new Promise<void>((resolve) => {
            interceptor.intercept(buildContext(), next).subscribe({ error: () => resolve() });
        });
    };

    test('logs 4xx client errors at warn, not error', async () => {
        // Arrange
        const logger = buildLogger();

        // Act
        await runFailing(logger, new BadRequestException('Invalid Refresh Token: Already Used'));

        // Assert
        expect(logger.warn).toHaveBeenCalledTimes(1);
        expect(logger.warn.mock.calls[0][0]).toContain('400');
        expect(logger.error).not.toHaveBeenCalled();
    });

    test('logs 409 conflicts at warn', async () => {
        // Arrange
        const logger = buildLogger();

        // Act
        await runFailing(logger, new ConflictException('Cannot delete subject. 4 vocabs are using it.'));

        // Assert
        expect(logger.warn).toHaveBeenCalledTimes(1);
        expect(logger.error).not.toHaveBeenCalled();
    });

    test('logs 5xx server errors at error', async () => {
        // Arrange
        const logger = buildLogger();

        // Act
        await runFailing(logger, new InternalServerErrorException('boom'));

        // Assert
        expect(logger.error).toHaveBeenCalledTimes(1);
        expect(logger.error.mock.calls[0][0]).toContain('500');
        expect(logger.warn).not.toHaveBeenCalled();
    });

    test('logs errors with no status at error', async () => {
        // Arrange
        const logger = buildLogger();

        // Act
        await runFailing(logger, new Error('not an http exception'));

        // Assert
        expect(logger.error).toHaveBeenCalledTimes(1);
        expect(logger.error.mock.calls[0][0]).toContain('XXX');
        expect(logger.warn).not.toHaveBeenCalled();
    });

    test('rethrows the original error so exception filters still run', async () => {
        // Arrange
        const logger = buildLogger();
        const interceptor = new LogInterceptor(logger as unknown as LoggerService);
        const thrown = new BadRequestException('bad input');
        const next: CallHandler = { handle: () => throwError(() => thrown) };

        // Act
        const caught = await new Promise<unknown>((resolve) => {
            interceptor.intercept(buildContext(), next).subscribe({ error: (e: unknown) => resolve(e) });
        });

        // Assert
        expect(caught).toBe(thrown);
    });

    test('still logs successful responses at info', async () => {
        // Arrange
        const logger = buildLogger();
        const interceptor = new LogInterceptor(logger as unknown as LoggerService);
        const next: CallHandler = { handle: () => of({} as never) };

        // Act
        await new Promise<void>((resolve) => {
            interceptor.intercept(buildContext(), next).subscribe({ complete: () => resolve() });
        });

        // Assert
        expect(logger.info).toHaveBeenCalledTimes(1);
        expect(logger.error).not.toHaveBeenCalled();
        expect(logger.warn).not.toHaveBeenCalled();
    });
});
