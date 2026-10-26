import { registerAs } from '@nestjs/config';

/** The public MCP endpoint. Everything stays off until MCP_ENABLED is exactly 'true'. */
export default registerAs('mcp', () => ({
    // Strict equality, never truthiness: 'false' must mean false.
    enabled: process.env.MCP_ENABLED === 'true',
    /** Public HTTPS URL of the MCP endpoint. It is also the Auth0 API audience, so web-app tokens never pass the MCP guard. */
    resourceUrl: process.env.MCP_RESOURCE_URL || undefined,
    /** Browser origins allowed to call the endpoint. A request without an Origin header (native and CLI clients) is always allowed. */
    allowedOrigins: (process.env.MCP_ALLOWED_ORIGINS || '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
}));
