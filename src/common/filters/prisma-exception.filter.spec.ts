import { ArgumentsHost, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaExceptionFilter } from './prisma-exception.filter';
import { WinstonLogger } from '../logger/winston.logger';

describe('PrismaExceptionFilter', () => {
    const createFilter = () => {
        const logger = {
            logError: jest.fn(),
            logWarn: jest.fn(),
        } as unknown as WinstonLogger;
        return new PrismaExceptionFilter(logger);
    };

    const createHost = () => {
        const json = jest.fn();
        const status = jest.fn().mockReturnValue({ json });
        const res = { status };
        return {
            host: {
                switchToHttp: () => ({
                    getResponse: () => res,
                    getRequest: () => ({
                        method: 'POST',
                        originalUrl: '/r',
                        requestId: 'r1',
                    }),
                }),
            } as ArgumentsHost,
            json,
            status,
        };
    };

    it('maps P2002 to 409 with field list', () => {
        const filter = createFilter();
        const { host, json, status } = createHost();
        const err = new Prisma.PrismaClientKnownRequestError('dup', {
            code: 'P2002',
            clientVersion: 'test',
            meta: { target: ['email', 'tenantId'] },
        });
        filter.catch(err, host);
        expect(status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
        expect(json).toHaveBeenCalledWith(
            expect.objectContaining({
                statusCode: HttpStatus.CONFLICT,
                message: 'Unique constraint violation on: email, tenantId',
            }),
        );
    });

    it('maps P2025 to 404 with default message', () => {
        const filter = createFilter();
        const { host, json, status } = createHost();
        const err = new Prisma.PrismaClientKnownRequestError('nf', {
            code: 'P2025',
            clientVersion: 'test',
            meta: {},
        });
        filter.catch(err, host);
        expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
        expect(json).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Record not found',
            }),
        );
    });

    it('maps PrismaClientValidationError to 400', () => {
        const filter = createFilter();
        const { host, status } = createHost();
        const err = new Prisma.PrismaClientValidationError('bad', { clientVersion: 'test' });
        filter.catch(err, host);
        expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    });

    it('maps P2003 to 409', () => {
        const filter = createFilter();
        const { host, json, status } = createHost();
        const err = new Prisma.PrismaClientKnownRequestError('fk', {
            code: 'P2003',
            clientVersion: 'test',
            meta: {},
        });
        filter.catch(err, host);
        expect(status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
        expect(json).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Foreign key constraint violation',
            }),
        );
    });

    it('maps P2014 to 409', () => {
        const filter = createFilter();
        const { host, json, status } = createHost();
        const err = new Prisma.PrismaClientKnownRequestError('rel', {
            code: 'P2014',
            clientVersion: 'test',
            meta: {},
        });
        filter.catch(err, host);
        expect(status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
        expect(json).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Relation violation',
            }),
        );
    });

    it('maps unknown Prisma code to 500', () => {
        const filter = createFilter();
        const { host, json, status } = createHost();
        const err = new Prisma.PrismaClientKnownRequestError('x', {
            code: 'P9999',
            clientVersion: 'test',
            meta: {},
        });
        filter.catch(err, host);
        expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
        expect(json).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'An unexpected database error occurred',
            }),
        );
    });
});
