import { FastifyReply } from 'fastify';

export class CookieUtil {
    private static readonly COOKIE_NAME = 'refreshToken';
    private static readonly DEFAULT_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

    /**
     * Set authentication cookies with secure settings
     */
    public static setAuthCookie(
        response: FastifyReply,
        refreshToken: string,
        maxAge?: number,
    ): void {
        const cookieValue = `${this.COOKIE_NAME}=${refreshToken}; HttpOnly; Secure=${
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
     * Clear authentication cookies
     */
    public static clearAuthCookie(response: FastifyReply): void {
        const cookieValue = `${this.COOKIE_NAME}=; HttpOnly; Secure=${
            process.env.NODE_ENV === 'production'
        }; SameSite=Strict; Max-Age=0; Path=/`;

        // Get existing Set-Cookie headers
        const existingCookies = response.raw.getHeader('Set-Cookie');
        const newCookies = existingCookies
            ? (Array.isArray(existingCookies) ? existingCookies : [existingCookies])
            : [];

        newCookies.push(cookieValue);
        response.raw.setHeader('Set-Cookie', newCookies as string[]);
    }

    /**
     * Get cookie name for external use
     */
    public static getCookieName(): string {
        return this.COOKIE_NAME;
    }
}
