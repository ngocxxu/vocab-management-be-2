import { VOCAB_TRAINER_AI_CONFIG } from '@/domains/ai/constants/vocab-trainer-job.constants';
import { EReminderType } from '@/domains/reminder/utils';
import { QUEUE_CONFIG } from './queue.config';

describe('fill-in-blank evaluation queue config (#18)', () => {
    const options = QUEUE_CONFIG[EReminderType.FILL_IN_BLANK_EVALUATION].defaultJobOptions;

    it('gives the Bull job more time than one AI call, so a hanging call is cut by the AI call timeout first', () => {
        // Act & Assert
        expect(options.timeout).toBeGreaterThan(VOCAB_TRAINER_AI_CONFIG.AI_CALL_TIMEOUT_SECONDS * 1000);
    });

    it('keeps the attempt count that the retry path relies on', () => {
        // Act & Assert
        expect(options.attempts).toBe(VOCAB_TRAINER_AI_CONFIG.MAX_RETRY_ATTEMPTS);
    });
});
