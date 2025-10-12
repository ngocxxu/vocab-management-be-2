import { ApiProperty } from '@nestjs/swagger';
import { CsvRowDto } from './csv-row.dto';

export class CsvImportErrorDto {
    @ApiProperty({ description: 'Row number that failed', example: 2 })
    public readonly row: number;

    @ApiProperty({ description: 'Error message', example: 'Invalid word type: UnknownType' })
    public readonly error: string;

    @ApiProperty({
        description: 'Row data that failed',
        example: { textSource: 'Hello', textTarget: 'Xin chào' },
    })
    public readonly data: CsvRowDto;
}
