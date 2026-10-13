import { HttpException } from '@nestjs/common';
import { ConfigPipe } from './config.pipe';

const AI_PROVIDER_KEYS = ['ai.provider', 'ai.audio.provider', 'ai.chat.provider'];

const createPipe = (key: string) => new ConfigPipe({ params: { key } });

// The four providers the FE offers. cloudflare is known to the factory but the pipe must reject it on save.
describe('ConfigPipe AI provider keys', () => {
    it.each(AI_PROVIDER_KEYS)('%s accepts an allowed provider', (key) => {
        expect(createPipe(key).transform({ value: 'gemini' })).toEqual({ value: 'gemini' });
    });

    it.each(AI_PROVIDER_KEYS)('%s rejects cloudflare', (key) => {
        expect(() => createPipe(key).transform({ value: 'cloudflare' })).toThrow(HttpException);
    });

    it.each(AI_PROVIDER_KEYS)('%s rejects a provider name outside the list', (key) => {
        expect(() => createPipe(key).transform({ value: 'OpenAI' })).toThrow(HttpException);
    });
});
