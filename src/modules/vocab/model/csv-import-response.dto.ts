import { ApiProperty } from '@nestjs/swagger';
import { CsvImportErrorDto } from './csv-import-error.dto';

export class CsvImportResponseDto {
    @ApiProperty({ description: 'Number of vocabs created', example: 5 })
    public readonly created: number;

    @ApiProperty({ description: 'Number of vocabs updated', example: 2 })
    public readonly updated: number;

    @ApiProperty({ description: 'Number of rows failed', example: 1 })
    public readonly failed: number;

    @ApiProperty({ description: 'Array of failed rows with errors', type: [CsvImportErrorDto] })
    public readonly errors: CsvImportErrorDto[];

    @ApiProperty({ description: 'Total rows processed', example: 8 })
    public readonly totalProcessed: number;

    public constructor(
        created: number,
        updated: number,
        errors: CsvImportErrorDto[],
        totalProcessed: number,
    ) {
        this.created = created;
        this.updated = updated;
        this.failed = errors.length;
        this.errors = errors;
        this.totalProcessed = totalProcessed;
    }
}
