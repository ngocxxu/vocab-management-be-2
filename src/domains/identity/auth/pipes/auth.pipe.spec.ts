import { SignUpPipe } from './auth.pipe';

describe('SignUpPipe', () => {
    const pipe = new SignUpPipe();
    const validBody = { email: 'user@example.com', password: 'secret123' };

    it('accepts sign-up without a role', () => {
        expect(() => pipe.transform(validBody)).not.toThrow();
    });

    it('drops a client-supplied role instead of passing it on', () => {
        const result = pipe.transform({ ...validBody, role: 'ADMIN' }) as Record<string, unknown>;

        expect(result).not.toHaveProperty('role');
        expect(result.email).toBe(validBody.email);
    });
});
