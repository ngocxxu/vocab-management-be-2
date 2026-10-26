import { CHAT_CANCEL_CHANNEL } from '../constants';
import { AbortControllerRegistry } from './abort-controller-registry.service';

function createFakes(options: { publishError?: Error } = {}) {
    const pubSub = {
        subscribe: jest.fn(),
        publish: options.publishError ? jest.fn().mockRejectedValue(options.publishError) : jest.fn().mockResolvedValue(undefined),
    };
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const registry = new AbortControllerRegistry(pubSub as never, logger as never);

    return { registry, pubSub, logger };
}

describe('AbortControllerRegistry', () => {
    it('starting a new run aborts the previous run of the same user', () => {
        // Arrange
        const { registry } = createFakes();
        const first = registry.create('u1');

        // Act
        const second = registry.create('u1');

        // Assert
        expect(first.aborted).toBe(true);
        expect(second.aborted).toBe(false);
    });

    it('abort stops the run of that user only', () => {
        // Arrange
        const { registry } = createFakes();
        const mine = registry.create('u1');
        const other = registry.create('u2');

        // Act
        registry.abort('u1');

        // Assert
        expect(mine.aborted).toBe(true);
        expect(other.aborted).toBe(false);
    });

    it('requestAbort stops the local run and publishes the cancel for the other pods', async () => {
        // Arrange
        const { registry, pubSub } = createFakes();
        const run = registry.create('u1');

        // Act
        await registry.requestAbort('u1');

        // Assert
        expect(run.aborted).toBe(true);
        expect(pubSub.publish).toHaveBeenCalledWith(CHAT_CANCEL_CHANNEL, { userId: 'u1' });
    });

    it('a failed publish is logged, and the local run still stops', async () => {
        // Arrange
        const { registry, logger } = createFakes({ publishError: new Error('redis down') });
        const run = registry.create('u1');

        // Act
        await expect(registry.requestAbort('u1')).resolves.toBeUndefined();

        // Assert
        expect(run.aborted).toBe(true);
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('redis down'));
    });

    it('subscribes to the cancel channel once at startup', () => {
        // Arrange
        const { registry, pubSub } = createFakes();

        // Act
        registry.onApplicationBootstrap();

        // Assert
        expect(pubSub.subscribe).toHaveBeenCalledTimes(1);
        expect(pubSub.subscribe).toHaveBeenCalledWith(CHAT_CANCEL_CHANNEL, expect.any(Function));
    });

    it('a cancel published by another pod stops the run that lives on this pod', () => {
        // Arrange
        const { registry, pubSub } = createFakes();
        registry.onApplicationBootstrap();
        const handler = pubSub.subscribe.mock.calls[0]?.[1] as (message: string) => void;
        const run = registry.create('u1');

        // Act
        handler(JSON.stringify({ userId: 'u1' }));

        // Assert
        expect(run.aborted).toBe(true);
    });

    it('ignores a cancel message it cannot read or that names no user', () => {
        // Arrange
        const { registry, pubSub, logger } = createFakes();
        registry.onApplicationBootstrap();
        const handler = pubSub.subscribe.mock.calls[0]?.[1] as (message: string) => void;
        const run = registry.create('u1');

        // Act + Assert
        expect(() => handler('not json')).not.toThrow();
        expect(() => handler(JSON.stringify({ userId: 5 }))).not.toThrow();
        expect(run.aborted).toBe(false);
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('unreadable'));
    });
});
