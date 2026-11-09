import { AiQueueService } from './ai-queue.service';

describe('AiQueueService locale', () => {
    it('passes the UI locale into the fill-in-blank evaluation job', async () => {
        // Arrange
        const fillInBlankProducer = { evaluateAnswers: jest.fn().mockResolvedValue({ jobId: 'job-1' }) };
        const lock = {
            acquireOrGetActive: jest.fn().mockResolvedValue({ acquired: true, job: { jobId: 'job-1', lockToken: 'tok' } }),
            releaseIfOwned: jest.fn(),
            toResponse: jest.fn(),
        };
        const unused = {} as never;
        const service = new AiQueueService(unused, unused, unused, fillInBlankProducer as never, lock as never);

        // Act
        await service.queueFillInBlankEvaluation({
            userId: 'u1',
            vocabTrainerId: 't1',
            jobType: 'fill-in-blank',
            queueName: 'fill-in-blank-evaluation',
            evaluations: [],
            answerSubmissions: [],
            locale: 'vi',
        } as never);

        // Assert
        expect(fillInBlankProducer.evaluateAnswers).toHaveBeenCalledWith(expect.objectContaining({ locale: 'vi', jobId: 'job-1', lockToken: 'tok' }), { jobId: 'job-1' });
    });
});
