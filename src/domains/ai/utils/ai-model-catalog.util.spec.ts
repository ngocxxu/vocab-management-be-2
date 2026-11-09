import { mapCloudflareModels, mapGeminiModels, mapGroqModels, mapOpenRouterModels } from './ai-model-catalog.util';

describe('mapGeminiModels', () => {
    it('keeps generateContent chat models and strips the models/ prefix', () => {
        const result = mapGeminiModels([
            { name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', supportedGenerationMethods: ['generateContent'] },
            { name: 'models/gemini-2.5-flash-preview-tts', supportedGenerationMethods: ['generateContent'] },
            { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
        ]);

        expect(result).toEqual([{ id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' }]);
    });
});

describe('mapGroqModels', () => {
    const raw = [{ id: 'openai/gpt-oss-120b' }, { id: 'whisper-large-v3' }, { id: 'meta-llama/llama-prompt-guard-2-22m' }, { id: 'old-model', active: false }];

    it('text drops whisper, guard and inactive models', () => {
        expect(mapGroqModels(raw, 'text')).toEqual([{ id: 'openai/gpt-oss-120b', name: 'openai/gpt-oss-120b' }]);
    });

    it('audio keeps only whisper', () => {
        expect(mapGroqModels(raw, 'audio')).toEqual([{ id: 'whisper-large-v3', name: 'whisper-large-v3' }]);
    });
});

describe('mapOpenRouterModels', () => {
    const raw = [
        { id: 'b/text', name: 'Text', architecture: { input_modalities: ['text'], output_modalities: ['text'] } },
        { id: 'a/audio-in', architecture: { input_modalities: ['text', 'audio'], output_modalities: ['text'] } },
        { id: 'c/image-out', architecture: { input_modalities: ['text'], output_modalities: ['image'] } },
    ];

    it('text keeps models that output text, sorted by id', () => {
        expect(mapOpenRouterModels(raw, 'text').map((m) => m.id)).toEqual(['a/audio-in', 'b/text']);
    });

    it('audio keeps models that accept audio input', () => {
        expect(mapOpenRouterModels(raw, 'audio')).toEqual([{ id: 'a/audio-in', name: 'a/audio-in' }]);
    });
});

describe('mapCloudflareModels', () => {
    it('drops guard and lora variants', () => {
        const result = mapCloudflareModels([{ name: '@cf/qwen/qwen3-30b-a3b-fp8' }, { name: '@cf/meta/llama-guard-3-8b' }, { name: '@cf/google/gemma-7b-it-lora' }]);

        expect(result).toEqual([{ id: '@cf/qwen/qwen3-30b-a3b-fp8', name: '@cf/qwen/qwen3-30b-a3b-fp8' }]);
    });
});
