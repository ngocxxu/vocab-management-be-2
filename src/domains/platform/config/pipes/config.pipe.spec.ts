import { HttpException } from '@nestjs/common';
import { ConfigPipe } from './config.pipe';

const AI_PROVIDER_KEYS = ['ai.provider', 'ai.audio.provider', 'ai.chat.provider'];
const AI_MODEL_KEYS = ['ai.model', 'ai.audio.model', 'ai.chat.model'];

const createPipe = (key: string) => new ConfigPipe({ params: { key } });

describe('ConfigPipe AI provider keys', () => {
    it.each(AI_PROVIDER_KEYS)('%s accepts an allowed provider', (key) => {
        expect(createPipe(key).transform({ value: 'gemini' })).toEqual({ value: 'gemini' });
    });

    it.each(AI_PROVIDER_KEYS)('%s accepts cloudflare', (key) => {
        expect(createPipe(key).transform({ value: 'cloudflare' })).toEqual({ value: 'cloudflare' });
    });

    it.each(AI_PROVIDER_KEYS)('%s rejects a provider name outside the list', (key) => {
        expect(() => createPipe(key).transform({ value: 'OpenAI' })).toThrow(HttpException);
    });
});

describe('ConfigPipe AI model keys', () => {
    it.each(AI_MODEL_KEYS)('%s accepts a model id string', (key) => {
        expect(createPipe(key).transform({ value: '@cf/qwen/qwen3-30b-a3b-fp8' })).toEqual({ value: '@cf/qwen/qwen3-30b-a3b-fp8' });
    });

    it.each(AI_MODEL_KEYS)('%s rejects a non-string', (key) => {
        expect(() => createPipe(key).transform({ value: 42 })).toThrow(HttpException);
    });
});
