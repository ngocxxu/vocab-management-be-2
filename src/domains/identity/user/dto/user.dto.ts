import { ApiProperty } from '@nestjs/swagger';
import { User, UserRole } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UserDto {
    @ApiProperty({ description: 'User unique ID', example: 'uuid-string' })
    @IsString()
    @IsNotEmpty()
    public readonly id: string;

    @ApiProperty({ description: 'User email', example: 'user@gmail.com' })
    @IsEmail()
    @IsNotEmpty()
    public readonly email: string;

    @ApiProperty({ description: 'User phone number', example: '+1234567890', required: false })
    @IsOptional()
    @IsString()
    public readonly phone?: string;

    @ApiProperty({ description: 'User creation date', example: '2024-01-01T00:00:00.000Z' })
    public readonly createdAt: Date;

    @ApiProperty({ description: 'User last update date', example: '2024-01-01T00:00:00.000Z' })
    public readonly updatedAt: Date;

    @ApiProperty({ description: 'User first name', example: 'John' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    public readonly firstName: string;

    @ApiProperty({ description: 'User last name', example: 'Doe' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    public readonly lastName: string;

    @ApiProperty({
        description: 'User avatar URL',
        example: 'https://i.pravatar.cc/300?img=test',
        required: false,
    })
    @IsOptional()
    @IsString()
    public readonly avatar?: string;

    @ApiProperty({ description: 'User role', enum: UserRole, example: UserRole.GUEST })
    @IsEnum(UserRole)
    public readonly role: UserRole;

    @ApiProperty({ description: 'User active status', example: true })
    @Type(() => Boolean)
    @IsBoolean()
    public readonly isActive: boolean;

    @ApiProperty({ description: 'Supabase user ID', example: 'supabase-uuid' })
    @IsString()
    public readonly supabaseUserId: string;

    public constructor(entity: User) {
        this.id = entity.id;
        this.email = entity.email;
        this.phone = entity.phone ?? undefined;
        this.createdAt = entity.createdAt;
        this.updatedAt = entity.updatedAt;
        this.firstName = entity.firstName;
        this.lastName = entity.lastName;
        this.avatar = entity.avatar ?? '';
        this.role = entity.role;
        this.isActive = entity.isActive;
        this.supabaseUserId = entity.supabaseUserId ?? '';
    }
}
