import { EmbedContentRequest, GoogleGenerativeAI, TaskType } from '@google/generative-ai';
import { Injectable, Logger } from '@nestjs/common';
import CircuitBreaker from 'opossum';
import { EmbeddingTaskType, IEmbeddingProvider } from './ai-provider.interface';

/**
 * Deliberately tolerant: embedding calls are slow by nature and a handful of
 * transient failures should not trip the circuit. `timeout` bounds a hung call
 * so it cannot pin a request thread waiting on the network.
 */
const BREAKER_OPTIONS = {
    timeout: 15_000,
    errorThresholdPercentage: 50,
    resetTimeout: 30_000,
    volumeThreshold: 5,
};

const EMBEDDING_MODEL = 'gemini-embedding-001';

// 768 (MRL truncation of the model's native 3072). Locked once vectors exist
// in Qdrant — changing this requires re-embedding every row. Qdrant's
// collection distance is Cosine, which is scale-invariant, so the truncated
// vector needs no manual re-normalization.
const OUTPUT_DIMENSIONALITY = 768;

const TASK_TYPE_MAP: Record<EmbeddingTaskType, TaskType> = {
    RETRIEVAL_DOCUMENT: TaskType.RETRIEVAL_DOCUMENT,
    RETRIEVAL_QUERY: TaskType.RETRIEVAL_QUERY,
};

// EmbedContentRequest in @google/generative-ai@0.24.1's .d.ts does not
// declare outputDimensionality, even though the REST API accepts it (Gemini
// docs: MRL truncation, 128-3072). Verified in the installed SDK that the
// request object is passed straight through and JSON.stringify'd as-is
// (formatEmbedContentInput / embedContent in
// node_modules/@google/generative-ai/dist/index.js), so the extra field is
// sent over the wire despite not being declared in the type.
type EmbedContentRequestWithDimensionality = EmbedContentRequest & { outputDimensionality?: number };

@Injectable()
export class EmbeddingProvider implements IEmbeddingProvider {
    private readonly logger = new Logger(EmbeddingProvider.name);
    private readonly genAI: GoogleGenerativeAI;

    /**
     * Its own breaker, separate from Qdrant's: the two services fail
     * independently, and a shared breaker would let one outage block the other.
     *
     * Matters most on the search path — `searchSemantic` calls this while a user
     * waits, so without a breaker a Gemini outage hangs every request until the
     * HTTP timeout. Open-circuit rejections carry `code: 'EOPENBREAKER'`, which
     * callers use to degrade instead of erroring.
     */
    private readonly breaker: CircuitBreaker<[string, EmbeddingTaskType], number[]>;

    public constructor() {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error('GEMINI_API_KEY environment variable is required');
        }
        this.genAI = new GoogleGenerativeAI(apiKey);

        this.breaker = new CircuitBreaker(async (text: string, taskType: EmbeddingTaskType) => this.callGemini(text, taskType), BREAKER_OPTIONS);
        this.breaker.on('open', () => this.logger.warn('Gemini embedding circuit opened — failing fast until it half-opens'));
        this.breaker.on('close', () => this.logger.log('Gemini embedding circuit closed'));
    }

    public async embed(text: string, taskType: EmbeddingTaskType): Promise<number[]> {
        return this.breaker.fire(text, taskType);
    }

    private async callGemini(text: string, taskType: EmbeddingTaskType): Promise<number[]> {
        try {
            const model = this.genAI.getGenerativeModel({ model: EMBEDDING_MODEL });

            const request: EmbedContentRequestWithDimensionality = {
                content: { role: 'user', parts: [{ text }] },
                taskType: TASK_TYPE_MAP[taskType],
                outputDimensionality: OUTPUT_DIMENSIONALITY,
            };

            const result = await model.embedContent(request);

            if (!result.embedding?.values?.length) {
                throw new Error('No embedding values received from model');
            }

            return result.embedding.values;
        } catch (error) {
            this.logger.error(`Error embedding content (taskType=${taskType}):`, error);
            throw error;
        }
    }
}
