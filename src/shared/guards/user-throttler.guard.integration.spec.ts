import { Controller, Get, INestApplication, NestMiddleware, Injectable, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { NextFunction, Request, Response } from 'express';
import request from 'supertest';

import { UserThrottlerGuard } from './user-throttler.guard';

const LIMIT = 3;

// Stands in for GlobalAuthGuard, which sets `authUser` (internal users.id) before the throttler runs.
@Injectable()
class FakeAuthMiddleware implements NestMiddleware {
    public use(req: Request, _res: Response, next: NextFunction): void {
        const userId = req.header('x-test-user');
        if (userId) {
            (req as unknown as { authUser: { id: string } }).authUser = { id: userId };
        }
        next();
    }
}

@Controller('probe')
class ProbeController {
    @Get('verify')
    public verify(): { ok: boolean } {
        return { ok: true };
    }

    @Get('other')
    public other(): { ok: boolean } {
        return { ok: true };
    }
}

@Module({
    imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: LIMIT }])],
    controllers: [ProbeController],
    providers: [{ provide: APP_GUARD, useClass: UserThrottlerGuard }],
})
class ProbeModule implements NestModule {
    public configure(consumer: MiddlewareConsumer): void {
        consumer.apply(FakeAuthMiddleware).forRoutes('*');
    }
}

describe('UserThrottlerGuard (integration)', () => {
    let app: INestApplication;

    beforeEach(async () => {
        const moduleRef = await Test.createTestingModule({ imports: [ProbeModule] }).compile();
        app = moduleRef.createNestApplication();
        await app.init();
    });

    afterEach(async () => {
        await app.close();
    });

    const hit = async (path: string, user: string): Promise<number> => (await request(app.getHttpServer()).get(path).set('x-test-user', user)).status;

    it('returns 429 once one user exceeds the limit on one handler', async () => {
        for (let i = 0; i < LIMIT; i++) {
            expect(await hit('/probe/verify', 'user-a')).toBe(200);
        }
        expect(await hit('/probe/verify', 'user-a')).toBe(429);
    });

    it('counts each handler separately, so other endpoints do not exhaust /verify', async () => {
        for (let i = 0; i < LIMIT; i++) {
            expect(await hit('/probe/other', 'user-a')).toBe(200);
        }
        expect(await hit('/probe/other', 'user-a')).toBe(429);
        expect(await hit('/probe/verify', 'user-a')).toBe(200);
    });

    it('counts each user separately, so one noisy user does not throttle another', async () => {
        for (let i = 0; i < LIMIT + 1; i++) {
            await hit('/probe/verify', 'user-a');
        }
        expect(await hit('/probe/verify', 'user-a')).toBe(429);
        expect(await hit('/probe/verify', 'user-b')).toBe(200);
    });
});
