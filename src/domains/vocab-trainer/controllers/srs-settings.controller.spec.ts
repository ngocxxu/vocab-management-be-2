import 'reflect-metadata';

import { RolesGuard } from '@/shared';
import { BadRequestException, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { FsrsDefaultsService } from '../services/fsrs-defaults.service';
import { SrsSettingsController } from './srs-settings.controller';

describe('SrsSettingsController', () => {
    let app: INestApplication;
    const fsrsDefaultsService = { getSettings: jest.fn(), updateSettings: jest.fn() };

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            controllers: [SrsSettingsController],
            providers: [{ provide: FsrsDefaultsService, useValue: fsrsDefaultsService }],
        })
            .overrideGuard(RolesGuard)
            .useValue({ canActivate: () => true })
            .compile();

        app = moduleRef.createNestApplication();
        app.use((req: Request & { currentUser?: unknown }, _res: Response, next: NextFunction) => {
            req.currentUser = { id: 'u1', role: 'MEMBER' };
            next();
        });
        // The same options as the real server
        app.useGlobalPipes(new ValidationPipe({ forbidNonWhitelisted: true, transform: true }));
        await app.init();
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('GET returns the settings of the current user', async () => {
        // Arrange
        fsrsDefaultsService.getSettings.mockResolvedValue({ defaults: { desiredRetention: 0.9 }, timezone: null });

        // Act
        const res = await request(app.getHttpServer()).get('/srs-settings').expect(200);

        // Assert
        expect(res.body).toEqual({ defaults: { desiredRetention: 0.9 }, timezone: null });
        expect(fsrsDefaultsService.getSettings).toHaveBeenCalledWith('u1');
    });

    test('PUT hands the body as it is to the service, which validates the values', async () => {
        // Arrange
        fsrsDefaultsService.updateSettings.mockResolvedValue({ defaults: { desiredRetention: 0.8 }, timezone: 'Asia/Tokyo' });
        const body = { defaults: { desiredRetention: 0.8, directions: ['SOURCE_TO_TARGET'] }, timezone: 'Asia/Tokyo' };

        // Act
        const res = await request(app.getHttpServer()).put('/srs-settings').send(body).expect(200);

        // Assert
        expect(res.body.timezone).toBe('Asia/Tokyo');
        expect(fsrsDefaultsService.updateSettings).toHaveBeenCalledWith('u1', expect.objectContaining(body));
    });

    test('PUT answers 400 when the service refuses a value', async () => {
        // Arrange
        fsrsDefaultsService.updateSettings.mockRejectedValue(new BadRequestException('defaults.desiredRetention: too small'));

        // Act
        const res = await request(app.getHttpServer())
            .put('/srs-settings')
            .send({ defaults: { desiredRetention: 0.1 } })
            .expect(400);

        // Assert
        expect(JSON.stringify(res.body)).toContain('desiredRetention');
    });

    test('PUT rejects a body that is not an object of the expected shape', async () => {
        // Act + Assert
        await request(app.getHttpServer()).put('/srs-settings').send({ defaults: 'oops' }).expect(400);
        await request(app.getHttpServer()).put('/srs-settings').send({ timezone: 5 }).expect(400);
        expect(fsrsDefaultsService.updateSettings).not.toHaveBeenCalled();
    });
});
