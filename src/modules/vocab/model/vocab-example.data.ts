import { ApiProperty } from '@nestjs/swagger';
import { VocabExample } from '@prisma/client';
export class VocabExampleDto {
    @ApiProperty({ description: 'Unique identifier for the example' })
    public id: string;

    @ApiProperty({ description: 'ID of the text target' })
    public textTargetId: string;

    @ApiProperty({ description: 'Source example text', example: 'Hello, how are you?' })
    public source: string;

    @ApiProperty({ description: 'Target example text', example: 'Xin chào, bạn khỏe không?' })
    public target: string;

    @ApiProperty({ description: 'Date when the example was created' })
    public readonly createdAt: Date;

    @ApiProperty({ description: 'Date when the example was last updated' })
    public readonly updatedAt: Date;

    public constructor(entity: VocabExample) {
        this.id = entity.id;
        this.textTargetId = entity.textTargetId;
        this.source = entity.source;
        this.target = entity.target;
        this.createdAt = entity.createdAt;
        this.updatedAt = entity.updatedAt;
    }
}
