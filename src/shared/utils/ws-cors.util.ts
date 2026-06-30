export function getWsCorsOptions(): { origin: boolean | string[]; credentials: boolean } {
    const isDevelopment = process.env.NODE_ENV !== 'production';
    const allowedOrigins =
        process.env.API_CORS_ORIGINS?.split(',')
            .map((o) => o.trim())
            .filter(Boolean) ?? [];

    return {
        origin: isDevelopment ? true : allowedOrigins.length > 0 ? allowedOrigins : false,
        credentials: true,
    };
}
