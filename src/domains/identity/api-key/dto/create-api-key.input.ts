import { ApiProperty } from '@nestjs/swagger';
import { ApiKeyScope } from '@prisma/client';
import { ArrayNotEmpty, IsArray, IsEnum, IsNotEmpty, IsString, MaxLength, ValidateIf } from 'class-validator';

export class CreateApiKeyInput {
    @ApiProperty({ description: 'Display name for the API key', example: 'iOS Shortcut', maxLength: 100 })
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    public readonly name: string;

    @ApiProperty({ description: 'Scopes to grant this key', enum: ApiKeyScope, isArray: true, example: [ApiKeyScope.QUICK_ADD_VOCAB] })
    @IsArray()
    @ArrayNotEmpty()
    @IsEnum(ApiKeyScope, { each: true })
    public readonly scopes: ApiKeyScope[];

    @ApiProperty({
        description: 'Language folder this key writes to. Required when scopes includes QUICK_ADD_VOCAB.',
        required: false,
    })
    @ValidateIf((input: CreateApiKeyInput) => input.scopes?.includes(ApiKeyScope.QUICK_ADD_VOCAB))
    @IsString()
    @IsNotEmpty({ message: 'languageFolderId is required when the QUICK_ADD_VOCAB scope is selected' })
    public readonly languageFolderId?: string;
}
