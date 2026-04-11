import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
    nodeEnv: process.env.NODE_ENV || 'development',
    apiPort: parseInt(process.env.API_PORT || '3002', 10),
    apiPrefix: process.env.API_PREFIX as string,
    apiCorsOrigins: process.env.API_CORS_ORIGINS || '',
    swaggerEnable: process.env.SWAGGER_ENABLE ?? '1',
    swaggerPrefix: process.env.SWAGGER_PREFIX as string,
    swaggerUser: process.env.SWAGGER_USER as string,
    swaggerPassword: process.env.SWAGGER_PASSWORD as string,
    healthToken: process.env.HEALTH_TOKEN || '',
    domain: process.env.DOMAIN || '',
    frontendUrl: process.env.FRONTEND_URL as string,
    cloudinaryUrl: process.env.CLOUDINARY_URL as string,
    openrouterApiKey: process.env.OPENROUTER_API_KEY || '',
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    groqApiKey: process.env.GROQ_API_KEY || '',
    instanceId: process.env.INSTANCE_ID || '',
    reminderPollerEnabled: process.env.REMINDER_POLLER_ENABLED,
    reminderReconciliationEnabled: process.env.REMINDER_RECONCILIATION_ENABLED,
    passengersAllowed: process.env.PASSENGERS_ALLOWED as string,
}));
