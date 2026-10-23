import { EventEmitter } from 'events';
import { WORKLOAD_QUEUE_NAMES } from '../constants/queue.constants';
import { QueueFailureListener } from './queue-failure.listener';

describe('QueueFailureListener', () => {
    const flush = async (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

    const build = () => {
        const queues = new Map<string, EventEmitter>();
        const moduleRef = {
            get: jest.fn((token: string) => {
                const name = token.replace(/^BullQueue_/, '');
                if (!queues.has(name)) {
                    queues.set(name, new EventEmitter());
                }

                return queues.get(name);
            }),
        };
        const jobFailureService = { recordFinalFailure: jest.fn().mockResolvedValue(undefined) };
        const logger = { error: jest.fn() };
        const deadLetterQueue = { add: jest.fn().mockResolvedValue(undefined) };
        const listener = new QueueFailureListener(moduleRef as never, jobFailureService as never, logger as never, deadLetterQueue as never);
        listener.onModuleInit();

        return { listener, queues, jobFailureService, deadLetterQueue };
    };

    const failedJob = (state: string) => ({
        id: 'j1',
        name: 'evaluate-answers',
        data: { userId: 'u1' },
        attemptsMade: 3,
        opts: { attempts: 3 },
        failedReason: 'provider down',
        stacktrace: [],
        getState: jest.fn().mockResolvedValue(state),
    });

    test('listens on every workload queue', () => {
        // Arrange + Act
        const { queues } = build();

        // Assert
        expect(queues.size).toBe(WORKLOAD_QUEUE_NAMES.length);
        for (const queue of queues.values()) {
            expect(queue.listenerCount('failed')).toBe(1);
        }
    });

    test('records a job that is left failed and mirrors it to the dead-letter queue', async () => {
        // Arrange
        const { queues, jobFailureService, deadLetterQueue } = build();

        // Act
        queues.get(WORKLOAD_QUEUE_NAMES[0])?.emit('failed', failedJob('failed'), new Error('provider down'));
        await flush();

        // Assert
        expect(jobFailureService.recordFinalFailure).toHaveBeenCalledTimes(1);
        expect(deadLetterQueue.add).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ sourceQueue: WORKLOAD_QUEUE_NAMES[0], originalJobId: 'j1' }),
            expect.anything(),
        );
    });

    test('ignores an attempt that Bull will retry', async () => {
        // Arrange
        const { queues, jobFailureService, deadLetterQueue } = build();

        // Act
        queues.get(WORKLOAD_QUEUE_NAMES[0])?.emit('failed', failedJob('delayed'), new Error('flaky'));
        await flush();

        // Assert
        expect(jobFailureService.recordFinalFailure).not.toHaveBeenCalled();
        expect(deadLetterQueue.add).not.toHaveBeenCalled();
    });

    test('stops listening on shutdown', () => {
        // Arrange
        const { listener, queues } = build();

        // Act
        listener.onModuleDestroy();

        // Assert
        for (const queue of queues.values()) {
            expect(queue.listenerCount('failed')).toBe(0);
        }
    });
});
