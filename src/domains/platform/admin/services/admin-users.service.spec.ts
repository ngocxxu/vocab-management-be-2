import type { UserRepository, UserTransaction } from '@/domains/identity/user/repositories';
import type { SupabaseAuthProvider } from '@/domains/media/supabase';
import type { LoggerService } from '@/shared';
import { BadGatewayException, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { User, UserRole } from '@prisma/client';
import { AdminUsersQueryDto } from '../dto/admin-users-query.dto';
import { AdminUserInvalidChangeException } from '../exceptions';
import { AdminUsersService } from './admin-users.service';

const TX = {} as UserTransaction;

const makeUser = (overrides: Partial<User> = {}): User =>
    ({
        id: 'u-target',
        email: 'target@example.com',
        phone: null,
        firstName: 'Tara',
        lastName: 'Target',
        avatar: null,
        role: UserRole.MEMBER,
        isActive: true,
        supabaseUserId: 'sb-target',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        ...overrides,
    }) as User;

const actor = makeUser({ id: 'u-admin', email: 'admin@example.com', role: UserRole.ADMIN, supabaseUserId: 'sb-admin' });

const createRepositoryMock = () => ({
    findPage: jest.fn().mockResolvedValue([[], 0]),
    findById: jest.fn(),
    countActiveAdmins: jest.fn().mockResolvedValue(1),
    update: jest.fn().mockImplementation(async (id: string, data: Partial<User>) => Promise.resolve(makeUser({ ...data, id }))),
    delete: jest.fn().mockResolvedValue(makeUser()),
    runSerializableWithRetry: jest.fn().mockImplementation(async (fn: (tx: UserTransaction) => Promise<unknown>) => fn(TX)),
});

type TRepositoryMock = ReturnType<typeof createRepositoryMock>;

const createSupabaseMock = (error: { status?: number; message: string } | null = null) => {
    const deleteUser = jest.fn().mockResolvedValue({ data: {}, error });
    const client = { auth: { admin: { deleteUser } } };
    const provider = { getServiceRoleClient: () => client } as unknown as SupabaseAuthProvider;
    return { provider, deleteUser };
};

const createService = (repository: TRepositoryMock, supabase: ReturnType<typeof createSupabaseMock>) => {
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as unknown as LoggerService;
    return new AdminUsersService(repository as unknown as UserRepository, supabase.provider, logger);
};

describe('AdminUsersService.list', () => {
    it('passes the filter, sort and page window to the repository', async () => {
        const repository = createRepositoryMock();
        const service = createService(repository, createSupabaseMock());
        const query = Object.assign(new AdminUsersQueryDto(), {
            page: 2,
            pageSize: 5,
            q: 'gmail',
            role: UserRole.MEMBER,
            isActive: false,
            sortBy: 'email',
            sortOrder: 'asc',
        });

        await service.list(query);

        expect(repository.findPage).toHaveBeenCalledWith({
            search: 'gmail',
            role: UserRole.MEMBER,
            isActive: false,
            sortBy: 'email',
            sortOrder: 'asc',
            skip: 5,
            take: 5,
        });
    });

    it('defaults to newest first on the first page with no filter', async () => {
        const repository = createRepositoryMock();
        const service = createService(repository, createSupabaseMock());

        await service.list(new AdminUsersQueryDto());

        expect(repository.findPage).toHaveBeenCalledWith({ sortBy: 'createdAt', sortOrder: 'desc', skip: 0, take: 10 });
    });

    it('returns the page with totals computed from the count', async () => {
        const repository = createRepositoryMock();
        repository.findPage.mockResolvedValue([[makeUser({ id: 'u-1' })], 11]);
        const service = createService(repository, createSupabaseMock());

        const page = await service.list(Object.assign(new AdminUsersQueryDto(), { page: 2, pageSize: 5 }));

        expect(page.items.map((user) => user.id)).toEqual(['u-1']);
        expect(page.totalItems).toBe(11);
        expect(page.totalPages).toBe(3);
        expect(page.currentPage).toBe(2);
    });
});

describe('AdminUsersService.update', () => {
    it('rejects an empty change with 400 once the user exists', async () => {
        const repository = createRepositoryMock();
        repository.findById.mockResolvedValue(makeUser({ id: 'u-target' }));
        const service = createService(repository, createSupabaseMock());

        await expect(service.update(actor, 'u-target', {})).rejects.toThrow(AdminUserInvalidChangeException);
        await expect(service.update(actor, 'u-target', {})).rejects.toThrow(BadRequestException);
        expect(repository.update).not.toHaveBeenCalled();
    });

    it('answers 404 before it looks at the body', async () => {
        const repository = createRepositoryMock();
        repository.findById.mockResolvedValue(null);
        const service = createService(repository, createSupabaseMock());

        await expect(service.update(actor, 'u-missing', {})).rejects.toThrow(NotFoundException);
    });

    it('rejects changing your own role or status with 400', async () => {
        const repository = createRepositoryMock();
        repository.findById.mockResolvedValue(actor);
        const service = createService(repository, createSupabaseMock());

        await expect(service.update(actor, 'u-admin', { role: UserRole.MEMBER })).rejects.toThrow('You cannot change your own role or status');
        expect(repository.update).not.toHaveBeenCalled();
    });

    it('returns 404 when the user does not exist', async () => {
        const repository = createRepositoryMock();
        repository.findById.mockResolvedValue(null);
        const service = createService(repository, createSupabaseMock());

        await expect(service.update(actor, 'u-missing', { isActive: false })).rejects.toThrow(NotFoundException);
    });

    it('returns 409 when demoting the last active admin', async () => {
        const repository = createRepositoryMock();
        repository.findById.mockResolvedValue(makeUser({ id: 'u-target', role: UserRole.ADMIN }));
        repository.countActiveAdmins.mockResolvedValue(0);
        const service = createService(repository, createSupabaseMock());

        await expect(service.update(actor, 'u-target', { role: UserRole.MEMBER })).rejects.toThrow(ConflictException);
        expect(repository.update).not.toHaveBeenCalled();
    });

    it('returns 409 when deactivating the last active admin', async () => {
        const repository = createRepositoryMock();
        repository.findById.mockResolvedValue(makeUser({ id: 'u-target', role: UserRole.ADMIN }));
        repository.countActiveAdmins.mockResolvedValue(0);
        const service = createService(repository, createSupabaseMock());

        await expect(service.update(actor, 'u-target', { isActive: false })).rejects.toThrow('There must be at least one active admin');
    });

    it('allows demoting one of two active admins, inside a serializable transaction', async () => {
        const repository = createRepositoryMock();
        repository.findById.mockResolvedValue(makeUser({ id: 'u-target', role: UserRole.ADMIN }));
        repository.countActiveAdmins.mockResolvedValue(1);
        const service = createService(repository, createSupabaseMock());

        const updated = await service.update(actor, 'u-target', { role: UserRole.MEMBER });

        expect(updated.role).toBe(UserRole.MEMBER);
        expect(repository.runSerializableWithRetry).toHaveBeenCalledWith(expect.any(Function));
        expect(repository.update).toHaveBeenCalledWith('u-target', { role: UserRole.MEMBER }, TX);
    });

    it('deactivates a non-admin without the last-admin check or a transaction', async () => {
        const repository = createRepositoryMock();
        repository.findById.mockResolvedValue(makeUser({ id: 'u-target', role: UserRole.MEMBER }));
        const service = createService(repository, createSupabaseMock());

        const updated = await service.update(actor, 'u-target', { isActive: false });

        expect(updated.isActive).toBe(false);
        expect(repository.countActiveAdmins).not.toHaveBeenCalled();
        expect(repository.runSerializableWithRetry).not.toHaveBeenCalled();
        expect(repository.update).toHaveBeenCalledWith('u-target', { isActive: false });
    });
});

describe('AdminUsersService.remove', () => {
    it('rejects deleting yourself with 400', async () => {
        const repository = createRepositoryMock();
        repository.findById.mockResolvedValue(actor);
        const supabase = createSupabaseMock();
        const service = createService(repository, supabase);

        await expect(service.remove(actor, 'u-admin')).rejects.toThrow('You cannot delete your own account');
        expect(supabase.deleteUser).not.toHaveBeenCalled();
    });

    it('returns 404 when the user does not exist', async () => {
        const repository = createRepositoryMock();
        repository.findById.mockResolvedValue(null);
        const service = createService(repository, createSupabaseMock());

        await expect(service.remove(actor, 'u-missing')).rejects.toThrow(NotFoundException);
    });

    it('returns 409 for the last active admin before touching Supabase', async () => {
        const repository = createRepositoryMock();
        repository.findById.mockResolvedValue(makeUser({ id: 'u-target', role: UserRole.ADMIN }));
        repository.countActiveAdmins.mockResolvedValue(0);
        const supabase = createSupabaseMock();
        const service = createService(repository, supabase);

        await expect(service.remove(actor, 'u-target')).rejects.toThrow(ConflictException);
        expect(supabase.deleteUser).not.toHaveBeenCalled();
    });

    it('deletes the Supabase account first, then the database row in a transaction', async () => {
        const repository = createRepositoryMock();
        repository.findById.mockResolvedValue(makeUser({ id: 'u-target' }));
        const supabase = createSupabaseMock();
        const service = createService(repository, supabase);

        const removed = await service.remove(actor, 'u-target');

        expect(removed.id).toBe('u-target');
        expect(supabase.deleteUser).toHaveBeenCalledWith('sb-target');
        expect(repository.delete).toHaveBeenCalledWith('u-target', TX);
        expect(supabase.deleteUser.mock.invocationCallOrder[0]).toBeLessThan(repository.delete.mock.invocationCallOrder[0] ?? Infinity);
    });

    it('treats a Supabase 404 as already deleted and still removes the row', async () => {
        const repository = createRepositoryMock();
        repository.findById.mockResolvedValue(makeUser({ id: 'u-target' }));
        const service = createService(repository, createSupabaseMock({ status: 404, message: 'User not found' }));

        await service.remove(actor, 'u-target');

        expect(repository.delete).toHaveBeenCalledWith('u-target', TX);
    });

    it('aborts without touching the database when Supabase fails with another error', async () => {
        const repository = createRepositoryMock();
        repository.findById.mockResolvedValue(makeUser({ id: 'u-target' }));
        const service = createService(repository, createSupabaseMock({ status: 500, message: 'upstream down' }));

        await expect(service.remove(actor, 'u-target')).rejects.toThrow(BadGatewayException);
        expect(repository.runSerializableWithRetry).not.toHaveBeenCalled();
        expect(repository.delete).not.toHaveBeenCalled();
    });

    it('skips Supabase when the user has no Supabase account and still removes the row', async () => {
        const repository = createRepositoryMock();
        repository.findById.mockResolvedValue(makeUser({ id: 'u-target', supabaseUserId: null }));
        const supabase = createSupabaseMock();
        const service = createService(repository, supabase);

        await service.remove(actor, 'u-target');

        expect(supabase.deleteUser).not.toHaveBeenCalled();
        expect(repository.delete).toHaveBeenCalledWith('u-target', TX);
    });
});
