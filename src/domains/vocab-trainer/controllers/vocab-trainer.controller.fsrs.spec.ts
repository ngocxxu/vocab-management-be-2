import 'reflect-metadata';

import { LoggerService, RolesGuard } from '@/shared';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { FsrsSessionService } from '../../vocab/services/fsrs-session.service';
import { VocabTrainerService } from '../services';
import { VocabTrainerController } from './vocab-trainer.controller';

describe('VocabTrainerController FSRS routes', () => {
    let app: INestApplication;
    const fsrsSessionService = { getQueue: jest.fn(), getSummary: jest.fn(), recordAnswer: jest.fn(), checkAnswer: jest.fn() };
    const vocabTrainerService = { updateFsrsSettings: jest.fn() };

    const validAnswer = { cardId: 'c1', answerId: 'a1', rating: 'GOOD', questionType: 'FLIP_CARD' };

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            controllers: [VocabTrainerController],
            providers: [
                { provide: LoggerService, useValue: { info: jest.fn() } },
                { provide: VocabTrainerService, useValue: vocabTrainerService },
                { provide: FsrsSessionService, useValue: fsrsSessionService },
            ],
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

    describe('GET :id/review-queue', () => {
        test('passes limit and ahead as numbers together with the user and the trainer', async () => {
            // Arrange
            fsrsSessionService.getQueue.mockResolvedValue({ ended: false, items: [] });

            // Act
            const res = await request(app.getHttpServer()).get('/vocab-trainers/t1/review-queue?limit=5&ahead=2').expect(200);

            // Assert
            expect(res.body).toEqual({ ended: false, items: [] });
            expect(fsrsSessionService.getQueue).toHaveBeenCalledWith('u1', 't1', expect.objectContaining({ limit: 5, ahead: 2 }));
        });

        test('works without query parameters', async () => {
            // Arrange
            fsrsSessionService.getQueue.mockResolvedValue({ ended: false, items: [] });

            // Act + Assert
            await request(app.getHttpServer()).get('/vocab-trainers/t1/review-queue').expect(200);
        });

        test.each(['limit=0', 'limit=101', 'limit=abc', 'ahead=-1', 'ahead=366'])('rejects %s', async (query) => {
            // Act + Assert
            await request(app.getHttpServer()).get(`/vocab-trainers/t1/review-queue?${query}`).expect(400);
            expect(fsrsSessionService.getQueue).not.toHaveBeenCalled();
        });
    });

    describe('GET :id/review-summary', () => {
        test('returns the summary of the trainer of the user', async () => {
            // Arrange
            fsrsSessionService.getSummary.mockResolvedValue({ overdue: 1 });

            // Act
            const res = await request(app.getHttpServer()).get('/vocab-trainers/t1/review-summary').expect(200);

            // Assert
            expect(res.body).toEqual({ overdue: 1 });
            expect(fsrsSessionService.getSummary).toHaveBeenCalledWith('u1', 't1');
        });
    });

    describe('POST :id/review-answer', () => {
        test('records the answer for the user and the trainer', async () => {
            // Arrange
            fsrsSessionService.recordAnswer.mockResolvedValue({ cardId: 'c1', isDuplicate: false });

            // Act
            await request(app.getHttpServer())
                .post('/vocab-trainers/t1/review-answer')
                .send({ ...validAnswer, durationMs: 1500 })
                .expect(201);

            // Assert
            expect(fsrsSessionService.recordAnswer).toHaveBeenCalledWith('u1', 't1', expect.objectContaining({ ...validAnswer, durationMs: 1500 }));
        });

        test.each([
            ['an unknown rating', { rating: 'MAYBE' }],
            ['a question type FSRS cannot review', { questionType: 'MULTIPLE_CHOICE' }],
            ['a missing answerId', { answerId: undefined }],
            ['an empty cardId', { cardId: '' }],
            ['a negative duration', { durationMs: -1 }],
        ])('rejects %s', async (_name, change) => {
            // Act + Assert
            await request(app.getHttpServer())
                .post('/vocab-trainers/t1/review-answer')
                .send({ ...validAnswer, ...change })
                .expect(400);
            expect(fsrsSessionService.recordAnswer).not.toHaveBeenCalled();
        });
    });

    describe('POST :id/review-check', () => {
        test('returns the suggestion without recording anything', async () => {
            // Arrange
            fsrsSessionService.checkAnswer.mockResolvedValue({ suggestedRating: 'GOOD', correctAnswers: ['hello'], diff: [] });

            // Act
            const res = await request(app.getHttpServer()).post('/vocab-trainers/t1/review-check').send({ cardId: 'c1', answer: 'hello' }).expect(201);

            // Assert
            expect(res.body.suggestedRating).toBe('GOOD');
            expect(fsrsSessionService.checkAnswer).toHaveBeenCalledWith('u1', 't1', expect.objectContaining({ cardId: 'c1', answer: 'hello' }));
            expect(fsrsSessionService.recordAnswer).not.toHaveBeenCalled();
        });

        test('rejects an answer that is too long and a missing card', async () => {
            // Act + Assert
            await request(app.getHttpServer())
                .post('/vocab-trainers/t1/review-check')
                .send({ cardId: 'c1', answer: 'x'.repeat(501) })
                .expect(400);
            await request(app.getHttpServer()).post('/vocab-trainers/t1/review-check').send({ answer: 'hello' }).expect(400);
        });
    });

    describe('PATCH :id (FSRS settings)', () => {
        test('passes the settings, with dates as Date and null kept', async () => {
            // Arrange
            vocabTrainerService.updateFsrsSettings.mockResolvedValue({ id: 't1' });

            // Act
            await request(app.getHttpServer())
                .patch('/vocab-trainers/t1')
                .send({ desiredRetention: 0.85, maximumInterval: 90, newPerDay: null, endsAt: '2030-01-01T00:00:00.000Z' })
                .expect(200);

            // Assert
            const [id, input, userId] = vocabTrainerService.updateFsrsSettings.mock.calls[0];
            expect(id).toBe('t1');
            expect(userId).toBe('u1');
            expect(input).toMatchObject({ desiredRetention: 0.85, maximumInterval: 90, newPerDay: null });
            expect(input.endsAt).toBeInstanceOf(Date);
        });

        test.each([
            ['a retention below 0.70', { desiredRetention: 0.5 }],
            ['a retention above 0.97', { desiredRetention: 0.99 }],
            ['a maximum interval of 0', { maximumInterval: 0 }],
            ['a maximum interval above 36500', { maximumInterval: 36501 }],
            ['new words per day below 1', { newPerDay: 0 }],
            ['a deadline that is not a date', { endsAt: 'tomorrow' }],
        ])('rejects %s', async (_name, body) => {
            // Act + Assert
            await request(app.getHttpServer()).patch('/vocab-trainers/t1').send(body).expect(400);
            expect(vocabTrainerService.updateFsrsSettings).not.toHaveBeenCalled();
        });

        test('hands mode and directions to the service, which refuses them', async () => {
            // Arrange
            vocabTrainerService.updateFsrsSettings.mockResolvedValue({ id: 't1' });

            // Act
            await request(app.getHttpServer())
                .patch('/vocab-trainers/t1')
                .send({ mode: 'CLASSIC', directions: ['SOURCE_TO_TARGET'] })
                .expect(200);

            // Assert
            expect(vocabTrainerService.updateFsrsSettings.mock.calls[0][1]).toMatchObject({ mode: 'CLASSIC', directions: ['SOURCE_TO_TARGET'] });
        });
    });
});
