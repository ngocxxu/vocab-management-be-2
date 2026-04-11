import type { AuthUser } from '@/auth/interfaces/auth-user.interface';

export {};

declare global {
    namespace Express {
        interface Request {
            requestId?: string;
            authUser?: AuthUser;
        }
    }
}
