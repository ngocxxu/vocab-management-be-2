import * as Joi from 'joi';

export const validationSchema = Joi.object({
    NODE_ENV: Joi.string().valid('development', 'production', 'test', 'staging').default('development'),

    API_PORT: Joi.number().required(),
    API_PREFIX: Joi.string().required(),
    API_CORS_ORIGINS: Joi.string().allow(''),

    SWAGGER_ENABLE: Joi.alternatives().try(Joi.string(), Joi.number()).required(),
    SWAGGER_PREFIX: Joi.string().required(),
    SWAGGER_USER: Joi.string().required(),
    SWAGGER_PASSWORD: Joi.string().required(),

    HEALTH_TOKEN: Joi.string().allow(''),

    DOMAIN: Joi.string().allow(''),
    FRONTEND_URL: Joi.string().uri().required(),

    CLOUDINARY_URL: Joi.string().required(),

    OPENROUTER_API_KEY: Joi.string().allow(''),
    GEMINI_API_KEY: Joi.string().allow(''),
    GROQ_API_KEY: Joi.string().allow(''),

    INSTANCE_ID: Joi.string().allow(''),
    REMINDER_POLLER_ENABLED: Joi.string().valid('true', 'false').allow(''),
    REMINDER_RECONCILIATION_ENABLED: Joi.string().valid('true', 'false').allow(''),

    PASSENGERS_ALLOWED: Joi.string().valid('yes', 'no').required(),

    DATABASE_URL: Joi.string().required(),

    JWT_SECRET: Joi.string().required(),
    JWT_ISSUER: Joi.string().required(),

    SUPABASE_URL: Joi.string().uri().required(),
    SUPABASE_KEY: Joi.string().required(),
    SUPABASE_SERVICE_ROLE_KEY: Joi.string().required(),

    EMAIL_USER: Joi.string().required(),
    EMAIL_PASSWORD: Joi.string().required(),

    FCM_PROJECT_ID: Joi.string().required(),
    FCM_CLIENT_EMAIL: Joi.string().required(),
    FCM_PRIVATE_KEY: Joi.string().required(),

    REDIS_URL: Joi.string().allow(''),
    REDIS_HOST: Joi.string().allow(''),
    REDIS_PORT: Joi.string().allow(''),
    REDIS_PASSWORD: Joi.string().allow(''),
    REDIS_DB: Joi.string().allow(''),
    REDIS_RETRY_DELAY: Joi.string().allow(''),
    REDIS_MAX_RETRIES: Joi.string().allow(''),
    REDIS_ENABLE_READY_CHECK: Joi.string().valid('true', 'false').allow(''),
    REDIS_MAX_MEMORY_POLICY: Joi.string().allow(''),
    REDIS_TTL: Joi.string().allow(''),
})
    .unknown(true)
    .custom((value: unknown, helpers) => {
        if (typeof value !== 'object' || value === null) {
            return helpers.error('any.custom', { message: 'Invalid environment value' });
        }
        const v = value as Record<string, unknown>;
        const url = typeof v.REDIS_URL === 'string' ? v.REDIS_URL.trim() : '';
        const host = typeof v.REDIS_HOST === 'string' ? v.REDIS_HOST.trim() : '';
        const port = typeof v.REDIS_PORT === 'string' ? v.REDIS_PORT.trim() : '';
        const hasUrl = Boolean(url);
        const hasHostPort = Boolean(host && port);
        if (!hasUrl && !hasHostPort) {
            return helpers.error('any.custom', {
                message: 'Either REDIS_URL or both REDIS_HOST and REDIS_PORT must be set',
            });
        }
        return value;
    });
