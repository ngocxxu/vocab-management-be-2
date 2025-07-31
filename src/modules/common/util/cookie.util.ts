import { FastifyReply } from 'fastify';

export class CookieUtil {
    private static readonly COOKIE_NAME = 'refreshToken';
    private static readonly DEFAULT_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

    /**
     * Set authentication cookies with secure settings
     */
    public static async setAuthCookie(
        response: FastifyReply,
        refreshToken: string,
        maxAge?: number,
    ) {
        const cookieValue = `${this.COOKIE_NAME}=${refreshToken}; HttpOnly; Secure=${
            process.env.NODE_ENV === 'production'
        }; SameSite=Strict; Max-Age=${maxAge || this.DEFAULT_MAX_AGE}; Path=/`;
        await response.header('Set-Cookie', cookieValue);
    }

    /**
     * Clear authentication cookies
     */
    public static async clearAuthCookie(response: FastifyReply) {
        const cookieValue = `${this.COOKIE_NAME}=; HttpOnly; Secure=${
            process.env.NODE_ENV === 'production'
        }; SameSite=Strict; Max-Age=0; Path=/`;
        await response.header('Set-Cookie', cookieValue);
    }

    /**
     * Get cookie name for external use
     */
    public static getCookieName(): string {
        return this.COOKIE_NAME;
    }
}
