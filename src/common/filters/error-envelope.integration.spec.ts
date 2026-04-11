import 'reflect-metadata';

import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { NextFunction, Request, Response } from 'express';
import { nanoid } from 'nanoid';
import request from 'supertest';

import { CommonModule } from '@/common/common.module';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';
import { PrismaExceptionFilter } from '@/common/filters/prisma-exception.filter';
import { WinstonLogger } from '@/common/logger/winston.logger';
import { VocabNotFoundException } from '@/domains/vocab/exceptions';

@Controller()
class EnvelopeTestController {
    @Get('throw-vocab-not-found')
    public throwVocabNotFound(): never {
        throw new VocabNotFoundException('v1');
    }
}

@Module({
    imports: [CommonModule],
    controllers: [EnvelopeTestController],
})
class EnvelopeTestModule {}

describe('Error response envelope (integration)', () => {
    let app: INestApplication;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [EnvelopeTestModule],
        }).compile();

        app = moduleFixture.createNestApplication();
        const winston = app.get(WinstonLogger);
        app.use((req: Request, _res: Response, next: NextFunction) => {
            const header = req.headers['x-request-id'];
            req.requestId =
                typeof header === 'string' && header.length > 0 ? header : nanoid();
            next();
        });
        app.useGlobalFilters(new PrismaExceptionFilter(winston), new HttpExceptionFilter(winston));
        await app.init();
    });

    afterAll(async () => {
        await app.close();
    });

    it('returns unified JSON including generated requestId when header absent', async () => {
        const res = await request(app.getHttpServer()).get('/throw-vocab-not-found').expect(404);
        expect(res.body).toEqual(
            expect.objectContaining({
                statusCode: 404,
                error: 'Not Found',
                message: expect.any(String),
                timestamp: expect.any(String),
                path: '/throw-vocab-not-found',
                requestId: expect.any(String),
            }),
        );
        expect(String(res.body.requestId).length).toBeGreaterThan(0);
    });

    it('echoes x-request-id on error body when present', async () => {
        const id = 'client-req-abc';
        const res = await request(app.getHttpServer())
            .get('/throw-vocab-not-found')
            .set('x-request-id', id)
            .expect(404);
        expect(res.body.requestId).toBe(id);
    });
});
