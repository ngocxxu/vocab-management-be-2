import { registerAs } from '@nestjs/config';

function buildRedisUrl(): string {
    const explicit = process.env.REDIS_URL?.trim();
    if (explicit) {
        return explicit;
    }
    const host = process.env.REDIS_HOST || 'localhost';
    const port = process.env.REDIS_PORT || '6379';
    const password = process.env.REDIS_PASSWORD;
    const db = process.env.REDIS_DB || '0';
    const auth = password ? `:${encodeURIComponent(password)}@` : '';
    return `redis://${auth}${host}:${port}/${db}`;
}

export default registerAs('redis', () => ({
    url: buildRedisUrl(),
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    retryDelayOnFailover: parseInt(process.env.REDIS_RETRY_DELAY || '100', 10),
    maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES || '3', 10),
    enableReadyCheck: process.env.REDIS_ENABLE_READY_CHECK === 'true',
    maxMemoryPolicy: process.env.REDIS_MAX_MEMORY_POLICY || 'allkeys-lru',
    ttl: parseInt(process.env.REDIS_TTL || '3600', 10),
}));
