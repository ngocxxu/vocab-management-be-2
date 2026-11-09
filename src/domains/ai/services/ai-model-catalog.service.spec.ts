import axios from 'axios';
import { AiModelCatalogRepository } from '../repositories';
import { AiModelCatalogService } from './ai-model-catalog.service';

jest.mock('axios');
jest.mock('@/shared/utils/sentry.util', () => ({ captureSentryException: jest.fn() }));

const getMock = (axios as unknown as { get: jest.Mock }).get;

const createService = () => {
    const repository = {
        findFresh: jest.fn().mockResolvedValue(null),
        findStale: jest.fn().mockResolvedValue(null),
        save: jest.fn().mockResolvedValue(undefined),
    };
    const logger = { warn: jest.fn(), info: jest.fn() };
    const service = new AiModelCatalogService(repository as unknown as AiModelCatalogRepository, logger as never);
    return { service, repository };
};

describe('AiModelCatalogService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        process.env.GROQ_API_KEY = 'test-key';
    });

    it('returns the fresh cache without calling the provider', async () => {
        const { service, repository } = createService();
        repository.findFresh.mockResolvedValue([{ id: 'm1', name: 'm1' }]);

        const result = await service.list('groq', 'text');

        expect(result).toEqual({ provider: 'groq', kind: 'text', models: [{ id: 'm1', name: 'm1' }], degraded: false });
        expect(getMock).not.toHaveBeenCalled();
    });

    it('fetches, maps and caches on a miss', async () => {
        const { service, repository } = createService();
        getMock.mockResolvedValue({ data: { data: [{ id: 'openai/gpt-oss-120b', active: true }, { id: 'whisper-large-v3' }] } });

        const result = await service.list('groq', 'text');

        expect(result.models).toEqual([{ id: 'openai/gpt-oss-120b', name: 'openai/gpt-oss-120b' }]);
        expect(result.degraded).toBe(false);
        expect(repository.save).toHaveBeenCalledWith('groq', 'text', result.models);
    });

    it('answers degraded with the stale list when the provider fails', async () => {
        const { service, repository } = createService();
        getMock.mockRejectedValue(new Error('network down'));
        repository.findStale.mockResolvedValue([{ id: 'old', name: 'old' }]);

        const result = await service.list('groq', 'text');

        expect(result).toEqual({ provider: 'groq', kind: 'text', models: [{ id: 'old', name: 'old' }], degraded: true });
    });

    it('answers degraded and empty when the key is missing and nothing is cached', async () => {
        const { service } = createService();
        delete process.env.GROQ_API_KEY;

        const result = await service.list('groq', 'text');

        expect(result).toEqual({ provider: 'groq', kind: 'text', models: [], degraded: true });
        expect(getMock).not.toHaveBeenCalled();
    });
});
