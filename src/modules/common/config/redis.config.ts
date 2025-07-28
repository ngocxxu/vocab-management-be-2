import { registerAs } from '@nestjs/config';

export const redisConfig = registerAs('redis', () => ({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0', 10),
  retryDelayOnFailover: parseInt(process.env.REDIS_RETRY_DELAY || '100', 10),
  maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES || '3', 10),
  enableReadyCheck: process.env.REDIS_ENABLE_READY_CHECK === 'true',
  maxMemoryPolicy: process.env.REDIS_MAX_MEMORY_POLICY || 'allkeys-lru',
  ttl: parseInt(process.env.REDIS_TTL || '3600', 10), // 1 hour default
  username: process.env.REDIS_USERNAME || 'default',
  tls: {}
}));