import { BadRequestException, HttpStatus, NotFoundException } from '@nestjs/common';
import { ArgumentsHost } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';
import { WinstonLogger } from '../logger/winston.logger';

describe('HttpExceptionFilter', () => {
    const createFilter = () => {
        const logger = {
            logError: jest.fn(),
            logWarn: jest.fn(),
        } as unknown as WinstonLogger;
        return { filter: new HttpExceptionFilter(logger), logger };
    };

    const createHost = (req: Record<string, unknown>) => {
        const json = jest.fn();
        const status = jest.fn().mockReturnValue({ json });
        const res = { status };
        return {
            host: {
                switchToHttp: () => ({
                    getResponse: () => res,
                    getRequest: () => req,
                }),
            } as ArgumentsHost,
            json,
            status,
        };
    };

    it('formats NotFoundException with unified body', () => {
        const { filter } = createFilter();
        const { host, json, status } = createHost({
            method: 'GET',
            originalUrl: '/api/v1/x',
            requestId: 'rid1',
        });

        filter.catch(new NotFoundException('missing'), host);

        expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
        expect(json).toHaveBeenCalledWith(
            expect.objectContaining({
                statusCode: HttpStatus.NOT_FOUND,
                message: 'missing',
                path: '/api/v1/x',
                requestId: 'rid1',
                error: 'Not Found',
            }),
        );
    });

    it('forwards validation array messages', () => {
        const { filter } = createFilter();
        const { host, json } = createHost({
            method: 'POST',
            originalUrl: '/v',
            requestId: undefined,
        });

        filter.catch(
            new BadRequestException({
                message: ['a', 'b'],
                error: 'Bad Request',
                statusCode: 400,
            }),
            host,
        );

        expect(json).toHaveBeenCalledWith(
            expect.objectContaining({
                statusCode: 400,
                message: ['a', 'b'],
            }),
        );
    });
});
