import { FastifyReply } from 'fastify';

export class CookieUtil {
    private static readonly REFRESH_TOKEN_COOKIE_NAME = 'refreshToken';
    private static readonly ACCESS_TOKEN_COOKIE_NAME = 'accessToken';
    private static readonly DEFAULT_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds
    private static readonly ACCESS_TOKEN_MAX_AGE = 60 * 60; // 1 hour in seconds

    /**
     * Set authentication cookies with secure settings
     */
    public static setRefreshTokenCookie(
        response: FastifyReply,
        refreshToken: string,
        maxAge?: number,
    ): void {
        const cookieValue = `${this.REFRESH_TOKEN_COOKIE_NAME}=${refreshToken}; HttpOnly; Secure=${
            process.env.NODE_ENV === 'production'
        }; SameSite=Strict; Max-Age=${maxAge || this.DEFAULT_MAX_AGE}; Path=/`;

        // Get existing Set-Cookie headers
        const existingCookies = response.raw.getHeader('Set-Cookie');
        const newCookies = existingCookies
            ? (Array.isArray(existingCookies) ? existingCookies : [existingCookies])
            : [];

        newCookies.push(cookieValue);
        response.raw.setHeader('Set-Cookie', newCookies as string[]);
    }

    /**
     * Set access token cookie
     */
    public static setAccessTokenCookie(
        response: FastifyReply,
        accessToken: string,
        maxAge?: number,
    ): void {
        const cookieValue = `${this.ACCESS_TOKEN_COOKIE_NAME}=${accessToken}; HttpOnly; Secure=${
            process.env.NODE_ENV === 'production'
        }; SameSite=Strict; Max-Age=${maxAge || this.ACCESS_TOKEN_MAX_AGE}; Path=/`;

        // Get existing Set-Cookie headers
        const existingCookies = response.raw.getHeader('Set-Cookie');
        const newCookies = existingCookies
            ? (Array.isArray(existingCookies) ? existingCookies : [existingCookies])
            : [];

        newCookies.push(cookieValue);
        response.raw.setHeader('Set-Cookie', newCookies as string[]);
    }

    /**
     * Set both access and refresh token cookies
     */
    public static setAuthCookies(
        response: FastifyReply,
        accessToken: string,
        refreshToken: string,
        accessTokenMaxAge?: number,
        refreshTokenMaxAge?: number,
    ): void {
        this.setAccessTokenCookie(response, accessToken, accessTokenMaxAge);
        this.setRefreshTokenCookie(response, refreshToken, refreshTokenMaxAge);
    }

    /**
     * Clear authentication cookies
     */
    public static clearAuthCookie(response: FastifyReply): void {
        const refreshCookieValue = `${this.REFRESH_TOKEN_COOKIE_NAME}=; HttpOnly; Secure=${
            process.env.NODE_ENV === 'production'
        }; SameSite=Strict; Max-Age=0; Path=/`;

        const accessCookieValue = `${this.ACCESS_TOKEN_COOKIE_NAME}=; HttpOnly; Secure=${
            process.env.NODE_ENV === 'production'
        }; SameSite=Strict; Max-Age=0; Path=/`;

        // Get existing Set-Cookie headers
        const existingCookies = response.raw.getHeader('Set-Cookie');
        const newCookies = existingCookies
            ? (Array.isArray(existingCookies) ? existingCookies : [existingCookies])
            : [];

        newCookies.push(refreshCookieValue, accessCookieValue);
        response.raw.setHeader('Set-Cookie', newCookies as string[]);
    }

    /**
     * Get cookie names for external use
     */
    public static getRefreshTokenCookieName(): string {
        return this.REFRESH_TOKEN_COOKIE_NAME;
    }

    public static getAccessTokenCookieName(): string {
        return this.ACCESS_TOKEN_COOKIE_NAME;
    }
}
