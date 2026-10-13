import { UserDto } from '@/domains/identity/user/dto';
import { PaginationDto } from '@/shared/dto/pagination.dto';
import { User } from '@prisma/client';

/** Providers are not loaded here, so `hasPassword` is false in admin responses. The admin table does not show it. */
export function toAdminUserDto(user: User): UserDto {
    return new UserDto(user);
}

export function toAdminUserPage(users: User[], totalItems: number, page: number, pageSize: number): PaginationDto<UserDto> {
    return new PaginationDto(users.map(toAdminUserDto), totalItems, page, pageSize);
}
