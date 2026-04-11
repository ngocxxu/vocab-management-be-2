import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

export class BulkDeleteInput {
    @ApiProperty({
        description: 'Array of vocabulary IDs to delete',
        type: 'array',
        items: { type: 'string' },
        example: ['cmgg412zo0001uuyr8uc1ahvs', 'cmgg4nvem001fuuyrcspcb391'],
    })
    @IsArray()
    @IsString({ each: true })
    public readonly ids: string[];
}
