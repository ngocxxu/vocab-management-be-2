/** Where the protected-resource metadata is served: the origin root, outside the API prefix (RFC 9728). */
export const MCP_METADATA_PATH = '.well-known/oauth-protected-resource';

export const MCP_SERVER_NAME = 'vocab';
export const MCP_SERVER_VERSION = '1.0.0';

/** The scopes a public tool can require. They are the scopes of the MCP API in Auth0. */
export const MCP_SCOPES = {
    READ: 'vocab:read',
    WRITE: 'vocab:write',
} as const;

export type McpScope = (typeof MCP_SCOPES)[keyof typeof MCP_SCOPES];

/** Per-IP requests per minute on the endpoint, counted before sign-in (#17). */
export const MCP_IP_LIMIT_PER_MINUTE = 120;

/** A JSON-RPC request is tiny. The global JSON parser still caps chunked bodies at its own limit. */
export const MCP_MAX_BODY_BYTES = 16 * 1024;

/** Upper bound for one tool result. Lists drop trailing items until they fit; anything still larger is refused. */
export const MCP_MAX_RESPONSE_BYTES = 64 * 1024;

/** Stable error codes in tool results. Clients can match on these. */
export const MCP_ERROR_CODES = {
    INVALID_PARAMS: 'invalid_params',
    UNKNOWN_TOOL: 'unknown_tool',
    INSUFFICIENT_SCOPE: 'insufficient_scope',
    RESPONSE_TOO_LARGE: 'response_too_large',
    INTERNAL_ERROR: 'internal_error',
} as const;

export type McpErrorCode = (typeof MCP_ERROR_CODES)[keyof typeof MCP_ERROR_CODES];
