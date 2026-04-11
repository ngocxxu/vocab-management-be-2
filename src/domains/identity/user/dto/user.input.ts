import { ApiProperty, PickType } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { UserDto } from './user.dto';

export class UserInput extends PickType(UserDto, ['id', 'email', 'avatar', 'firstName', 'lastName', 'phone', 'role', 'isActive'] as const) {
    @ApiProperty({ description: 'User password', example: 'password123', minLength: 6, required: false })
    @IsOptional()
    @IsString()
    @MinLength(6)
    public readonly password?: string;
}
