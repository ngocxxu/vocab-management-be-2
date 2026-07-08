import { ApiProperty } from '@nestjs/swagger';
import { ApiKeyDto } from './api-key.dto';

export class CreateApiKeyResponseDto extends ApiKeyDto {
    @ApiProperty({
        description: 'The raw API key. Shown only once, at creation time — it cannot be retrieved again after this response.',
        example: 'vk_9f8a2b1c3d4e5f6a7b8c9d0e1f2a3b4c',
    })
    public readonly key: string;

    public constructor(entity: ConstructorParameters<typeof ApiKeyDto>[0], rawKey: string) {
        super(entity);
        this.key = rawKey;
    }
}
