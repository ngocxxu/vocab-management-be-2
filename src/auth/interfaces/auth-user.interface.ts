export interface AuthUser {
    id: string;
    email: string | null;
    roles: string[];
    provider: 'jwt' | 'firebase';
}
