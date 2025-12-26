import { AiServiceConfig } from './type.util';

// Default model fallback order when no config exists
export const DEFAULT_MODEL_FALLBACK_ORDER = [
    'gemini-2.0-flash-lite',
    'gemini-2.0-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.5-flash',
    'gemini-2.0-flash-exp',
    'gemini-2.5-pro',
    'gemini-3-pro',
    'learnlm-2.0-flash-exp',
    'gemini-2.5-flash-tts',
    'google/gemini-3-flash-preview',
    'mistralai/mistral-small-creative',
    'mistralai/devstral-2512:free',
    'openai/gpt-5.2-chat',
    'openai/gpt-5.2-pro',
] as const;

// Constants for AI service configuration
export const AI_CONFIG: AiServiceConfig = {
    modelName: 'gemini-3-pro',
    questionCount: 4,
    passingScore: 70,
    sourceQuestionProbability: 0.5,
    maxRetries: 0,
    retryDelayMs: 1000,
    models: DEFAULT_MODEL_FALLBACK_ORDER,
} as const;

export const QUESTION_TYPES = {
    SOURCE: 'textSource',
    TARGET: 'textTarget',
} as const;
