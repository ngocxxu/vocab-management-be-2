/**
 * JWT Utility functions for token decoding and manipulation
 */

export interface JWTPayload {
    iss?: string;
    sub?: string;
    aud?: string | string[];
    exp?: number;
    nbf?: number;
    iat?: number;
    jti?: string;
    user_metadata?: {
        [key: string]: string | boolean | number;
    };
}

/**
 * Decode a JWT token without verification
 * This is useful for tokens from external providers like Supabase
 *
 * @param token - The JWT token to decode
 * @returns The decoded payload or null if invalid
 */
export function jwtDecode(token: string): JWTPayload | null {
    try {
        // Split the token into parts
        const parts = token.split('.');
        if (parts.length !== 3) {
            return null;
        }

        // Decode the payload (second part)
        const payload = parts[1];

        // Add padding if necessary
        const paddedPayload = payload + '='.repeat((4 - (payload.length % 4)) % 4);

        // Decode base64url to base64
        const base64 = paddedPayload.replace(/-/g, '+').replace(/_/g, '/');

        // Decode base64 to string
        const decodedString = Buffer.from(base64, 'base64').toString('utf8');

        // Parse JSON
        const decodedPayload = JSON.parse(decodedString) as JWTPayload;

        return decodedPayload;
    } catch (error) {
        // eslint-disable-next-line no-console
        console.error('JWT decode error:', error);
        return null;
    }
}

/**
 * Verify if a JWT token is expired
 *
 * @param token - The JWT token to check
 * @returns true if expired, false if not expired, null if invalid
 */
export function isTokenExpired(token: string): boolean | null {
    const payload = jwtDecode(token);
    if (!payload || !payload.exp) {
        return null;
    }

    const currentTime = Math.floor(Date.now() / 1000);
    return payload.exp < currentTime;
}

/**
 * Get the expiration time from a JWT token
 *
 * @param token - The JWT token
 * @returns The expiration timestamp or null if invalid
 */
export function getTokenExpiration(token: string): number | null {
    const payload = jwtDecode(token);
    return payload?.exp || null;
}

/**
 * Get the subject (user ID) from a JWT token
 *
 * @param token - The JWT token
 * @returns The subject or null if invalid
 */
export function getTokenSubject(token: string): string | null {
    const payload = jwtDecode(token);
    return payload?.sub || null;
}

/**
 * Get custom claims from a JWT token
 *
 * @param token - The JWT token
 * @returns Object containing custom claims or null if invalid
 */
export function getTokenClaims(token: string): Record<string, unknown> | null {
    const payload = jwtDecode(token);
    if (!payload) {
        return null;
    }

    // Remove standard JWT claims
    const standardClaims = ['iss', 'sub', 'aud', 'exp', 'nbf', 'iat', 'jti'];
    const customClaims: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(payload)) {
        if (!standardClaims.includes(key)) {
            customClaims[key] = value;
        }
    }

    return customClaims;
}
