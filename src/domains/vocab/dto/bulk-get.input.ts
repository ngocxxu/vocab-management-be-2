import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class BulkGetInput {
    @ApiProperty({
        description: 'Array of vocabulary IDs to fetch',
        type: 'array',
        items: { type: 'string' },
        example: ['cmgg412zo0001uuyr8uc1ahvs', 'cmgg4nvem001fuuyrcspcb391'],
    })
    @IsArray()
    @ArrayNotEmpty()
    @ArrayMaxSize(500)
    @IsString({ each: true })
    public readonly ids!: string[];
}
