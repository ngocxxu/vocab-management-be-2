import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AdminUsersQueryDto } from './admin-users-query.dto';

describe('AdminUsersQueryDto', () => {
    const parse = (query: Record<string, unknown>) => plainToInstance(AdminUsersQueryDto, query);

    it('reads isActive=false as false, not as true', () => {
        expect(parse({ isActive: 'false' }).isActive).toBe(false);
    });

    it('reads isActive=true as true', () => {
        expect(parse({ isActive: 'true' }).isActive).toBe(true);
    });

    it('leaves isActive undefined when the filter is absent, so no status filter applies', () => {
        expect(parse({}).isActive).toBeUndefined();
    });

    it('converts numeric query strings and keeps the defaults for absent fields', async () => {
        const query = parse({ page: '3', pageSize: '20' });

        expect(query.page).toBe(3);
        expect(query.pageSize).toBe(20);
        expect(query.sortBy).toBe('createdAt');
        expect(query.sortOrder).toBe('desc');
        await expect(validate(query)).resolves.toHaveLength(0);
    });

    it('rejects a pageSize above 100', async () => {
        const errors = await validate(parse({ pageSize: '101' }));

        expect(errors.map((error) => error.property)).toContain('pageSize');
    });
});
