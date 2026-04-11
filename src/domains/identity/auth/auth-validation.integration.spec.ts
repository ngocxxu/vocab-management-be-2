import 'reflect-metadata';

import { Body, Controller, HttpStatus, Module, Post, ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common/interfaces/nest-application.interface';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { OAuthSyncInput, SignInInput } from './dto/auth.input';
import { OAuthSyncPipe, SignInPipe } from './pipes';

/** Minimal JWT shape accepted by @IsJWT() (signature not verified here). */
const SAMPLE_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XskL0d3WHnaKVNdJgUo8';

@Controller('auth')
class AuthValidationTestController {
    @Post('oauth/sync')
    public oauthSync(@Body(OAuthSyncPipe) body: OAuthSyncInput): { ok: true } {
        void body;
        return { ok: true };
    }

    @Post('signin')
    public signIn(@Body(SignInPipe) body: SignInInput): { ok: true } {
        void body;
        return { ok: true };
    }
}

@Module({
    controllers: [AuthValidationTestController],
})
class AuthValidationTestModule {}

describe('Auth DTOs with global ValidationPipe (integration)', () => {
    let app: INestApplication;

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [AuthValidationTestModule],
        }).compile();

        app = moduleRef.createNestApplication();
        app.useGlobalPipes(
            new ValidationPipe({
                whitelist: true,
                forbidNonWhitelisted: true,
                transform: true,
            }),
        );
        await app.init();
    });

    afterAll(async () => {
        await app.close();
    });

    it('POST /auth/oauth/sync passes whitelisted tokens through to Joi', async () => {
        await request(app.getHttpServer())
            .post('/auth/oauth/sync')
            .send({ accessToken: SAMPLE_JWT, refreshToken: 'opaque-refresh-token' })
            .expect(HttpStatus.CREATED)
            .expect({ ok: true });
    });

    it('POST /auth/oauth/sync rejects accessToken that is not a JWT (class-validator)', async () => {
        const res = await request(app.getHttpServer()).post('/auth/oauth/sync').send({ accessToken: 'not-a-jwt', refreshToken: 'opaque' }).expect(HttpStatus.BAD_REQUEST);

        expect(res.body).toEqual(
            expect.objectContaining({
                statusCode: 400,
                message: expect.anything(),
            }),
        );
    });

    it('POST /auth/signin passes email and password through global pipe to Joi', async () => {
        await request(app.getHttpServer()).post('/auth/signin').send({ email: 'user@example.com', password: 'secret12' }).expect(HttpStatus.CREATED).expect({ ok: true });
    });
});
