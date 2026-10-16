import type { AuthUser } from '@/auth';
import { LoggerService } from '@/shared/services/logger.service';
import { Prisma, User } from '@prisma/client';
import { UserIdentityRepository, UserRepository } from '../../user/repositories';
import { AuthConflictException, AuthForbiddenException } from '../exceptions';
import { AuthService } from './auth.service';

const ISSUER = 'https://vocab-development.jp.auth0.com/';

const auth0User = (overrides: Partial<AuthUser> = {}): AuthUser => ({
    id: 'google-oauth2|1',
    email: 'new@example.com',
    emailVerified: true,
    roles: [],
    provider: 'auth0',
    issuer: ISSUER,
    subject: 'google-oauth2|1',
    profile: { firstName: 'Ada', lastName: 'Lovelace', avatar: 'https://img/a.png' },
    ...overrides,
});

/** In-memory stand-ins that enforce the same unique constraints (email, issuer+subject) as the database. */
function createStore() {
    const users: User[] = [];
    const identities: { userId: string; issuer: string; subject: string }[] = [];
    let nextId = 1;

    const uniqueViolation = () => new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' });
    const tick = async () => Promise.resolve();

    const userRepository = {
        findByEmailIgnoreCase: jest.fn(async (email: string) => {
            await tick();
            return users.find((user) => user.email.toLowerCase() === email.toLowerCase()) ?? null;
        }),
        create: jest.fn(async (data: Prisma.UserCreateInput) => {
            await tick();
            if (users.some((user) => user.email === data.email)) {
                throw uniqueViolation();
            }
            const created = { ...data, id: `u-${nextId++}`, isActive: true, role: 'GUEST', createdAt: new Date(), updatedAt: new Date() } as unknown as User;
            users.push(created);
            const nested = (data.identities as { create: { issuer: string; subject: string } }).create;
            identities.push({ userId: created.id, issuer: nested.issuer, subject: nested.subject });
            return created;
        }),
    };
    const identityRepository = {
        findUserByIdentity: jest.fn(async (issuer: string, subject: string) => {
            await tick();
            const identity = identities.find((entry) => entry.issuer === issuer && entry.subject === subject);
            return users.find((user) => user.id === identity?.userId) ?? null;
        }),
    };
    const logger = { info: jest.fn() } as unknown as LoggerService;
    const service = new AuthService(userRepository as unknown as UserRepository, {} as never, logger, identityRepository as unknown as UserIdentityRepository);
    return { service, users, identities, userRepository };
}

describe('AuthService.syncAuth0User', () => {
    it('creates the User and its Identity for a verified email', async () => {
        const { service, users, identities } = createStore();

        const user = await service.syncAuth0User(auth0User());

        expect(users).toHaveLength(1);
        expect(identities).toEqual([{ userId: user.id, issuer: ISSUER, subject: 'google-oauth2|1' }]);
        expect(user).toMatchObject({ email: 'new@example.com', firstName: 'Ada', lastName: 'Lovelace', role: 'GUEST', emailConfirmed: true });
    });

    it('is idempotent: a repeated call returns the same User and creates nothing', async () => {
        const { service, users } = createStore();

        const first = await service.syncAuth0User(auth0User());
        const second = await service.syncAuth0User(auth0User());

        expect(second.id).toBe(first.id);
        expect(users).toHaveLength(1);
    });

    it('creates exactly one User when two first calls race', async () => {
        const { service, users, identities } = createStore();

        const [a, b] = await Promise.all([service.syncAuth0User(auth0User()), service.syncAuth0User(auth0User())]);

        expect(a.id).toBe(b.id);
        expect(users).toHaveLength(1);
        expect(identities).toHaveLength(1);
    });

    it.each([
        ['an unverified email', { emailVerified: false }],
        ['a missing email', { email: null }],
    ])('refuses %s and creates nothing', async (_name, overrides) => {
        const { service, users, userRepository } = createStore();

        await expect(service.syncAuth0User(auth0User(overrides))).rejects.toBeInstanceOf(AuthForbiddenException);

        expect(users).toHaveLength(0);
        expect(userRepository.create).not.toHaveBeenCalled();
    });

    it('returns 409 account_link_required when the email belongs to another User, and links nothing', async () => {
        const { service, users, identities, userRepository } = createStore();
        const otherOwner = { email: 'new@example.com', firstName: 'Old', lastName: 'Owner', identities: { create: { issuer: ISSUER, subject: 'google-oauth2|OTHER' } } };
        await userRepository.create(otherOwner as Prisma.UserCreateInput);

        await expect(service.syncAuth0User(auth0User())).rejects.toMatchObject({ message: 'account_link_required' });
        await expect(service.syncAuth0User(auth0User())).rejects.toBeInstanceOf(AuthConflictException);

        expect(users).toHaveLength(1);
        expect(identities).toEqual([{ userId: users[0].id, issuer: ISSUER, subject: 'google-oauth2|OTHER' }]);
    });

    it('treats an existing mixed-case email as a collision instead of creating a duplicate', async () => {
        const { service, users, userRepository } = createStore();
        const mixedCaseOwner = { email: 'New@Example.com', firstName: 'Old', lastName: 'Owner', identities: { create: { issuer: ISSUER, subject: 'google-oauth2|OTHER' } } };
        await userRepository.create(mixedCaseOwner as Prisma.UserCreateInput);

        await expect(service.syncAuth0User(auth0User())).rejects.toMatchObject({ message: 'account_link_required' });

        expect(users).toHaveLength(1);
    });

    it('falls back to the email name when the token carries no profile', async () => {
        const { service } = createStore();

        const user = await service.syncAuth0User(auth0User({ profile: undefined, email: 'grace.hopper@example.com' }));

        expect(user.firstName).toBe('grace.hopper');
        expect(user.lastName).toBe('');
    });

    it('refuses anything that is not an Auth0 identity', async () => {
        const { service } = createStore();

        await expect(service.syncAuth0User({ id: 'sb-1', email: 'a@b.c', roles: [], provider: 'supabase' })).rejects.toBeInstanceOf(AuthForbiddenException);
    });
});
