import { createHash, randomBytes } from 'crypto';

const API_KEY_PREFIX = 'vk_';
const API_KEY_RANDOM_BYTES = 32;
const KEY_PREFIX_DISPLAY_LENGTH = 12;

export interface GeneratedApiKey {
    readonly rawKey: string;
    readonly keyHash: string;
    readonly keyPrefix: string;
}

export function generateApiKey(): GeneratedApiKey {
    const rawKey = `${API_KEY_PREFIX}${randomBytes(API_KEY_RANDOM_BYTES).toString('base64url')}`;

    return {
        rawKey,
        keyHash: hashApiKey(rawKey),
        keyPrefix: rawKey.slice(0, KEY_PREFIX_DISPLAY_LENGTH),
    };
}

export function hashApiKey(rawKey: string): string {
    return createHash('sha256').update(rawKey).digest('hex');
}
