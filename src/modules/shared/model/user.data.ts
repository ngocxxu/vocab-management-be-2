import { ApiProperty } from '@nestjs/swagger';
import { User, UserRole } from '@prisma/client';

export class UserDto {
    @ApiProperty({ description: 'Unique identifier for the user' })
    public readonly id: string;

    @ApiProperty({ description: 'Email address of the user' })
    public readonly email: string;

    @ApiProperty({ description: 'First name of the user', required: false })
    public readonly firstName?: string;

    @ApiProperty({ description: 'Last name of the user', required: false })
    public readonly lastName?: string;

    @ApiProperty({ description: 'Phone number of the user', required: false })
    public readonly phone?: string;

    @ApiProperty({ description: 'Avatar URL of the user', required: false })
    public readonly avatar?: string;

    @ApiProperty({
        description: 'Role of the user',
        enum: ['ADMIN', 'STAFF', 'CUSTOMER'],
        example: 'CUSTOMER',
    })
    public readonly role: UserRole;

    @ApiProperty({ description: 'Whether the user is active' })
    public readonly isActive: boolean;

    public constructor(entity: User) {
        this.id = entity.id;
        this.email = entity.email;
        this.firstName = entity.firstName ?? undefined;
        this.lastName = entity.lastName ?? undefined;
        this.phone = entity.phone ?? undefined;
        this.avatar = entity.avatar ?? undefined;
        this.role = entity.role;
        this.isActive = entity.isActive;
    }
}
