import {
    Body,
    Controller,
    Delete,
    Get,
    HttpStatus,
    Param,
    Post,
    Put,
    UseGuards,
    Query,
    BadRequestException,
    Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags, ApiConsumes } from '@nestjs/swagger';
import { User, UserRole } from '@prisma/client';
import { Request } from 'express';
import { LoggerService, RolesGuard } from '../../common';
import { CurrentUser, Roles } from '../../common/decorator';
import { PaginationDto } from '../../common/model/pagination.dto';
import { VocabDto, VocabInput, CsvImportQueryDto, CsvImportResponseDto } from '../model';
import { VocabQueryParamsInput } from '../model/vocab-query-params.input';
import { VocabService } from '../service';
import { CsvParserUtil, CsvRowData } from '../util/csv-parser.util';

// Type for multer file
type MulterFile = {
    fieldname: string;
    originalname: string;
    encoding: string;
    mimetype: string;
    buffer: Buffer;
    size: number;
};

// Type for request with multer file
type RequestWithFile = Request & {
    file?: MulterFile;
};

@Controller('vocabs')
@ApiTags('vocab')
@ApiBearerAuth()
export class VocabController {
    public constructor(
        private readonly logger: LoggerService,
        private readonly vocabService: VocabService,
    ) {}

    @Get()
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.STAFF])
    @ApiOperation({ summary: 'Find all vocabs' })
    @ApiResponse({ status: HttpStatus.OK, type: VocabDto })
    public async find(
        @Query() query: VocabQueryParamsInput,
        @CurrentUser() user: User,
    ): Promise<PaginationDto<VocabDto>> {
        return this.vocabService.find(query, user.id);
    }

    @Get('random/:count')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.STAFF])
    @ApiOperation({ summary: 'Find random vocab' })
    @ApiResponse({ status: HttpStatus.OK, type: VocabDto })
    public async findRandom(
        @Param('count') count: number,
        @CurrentUser() user: User,
    ): Promise<VocabDto[]> {
        return this.vocabService.findRandom(count, user.id);
    }

    @Get(':id')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.STAFF])
    @ApiOperation({ summary: 'Find vocab by ID' })
    @ApiResponse({ status: HttpStatus.OK, type: VocabDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Vocab not found' })
    public async findOne(@Param('id') id: string, @CurrentUser() user: User): Promise<VocabDto> {
        return this.vocabService.findOne(id, user.id);
    }

    @Post()
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.STAFF])
    @ApiOperation({ summary: 'Create vocab' })
    @ApiResponse({ status: HttpStatus.CREATED, type: VocabDto })
    public async create(@Body() input: VocabInput, @CurrentUser() user: User): Promise<VocabDto> {
        const vocab = await this.vocabService.create(input, user.id);
        this.logger.info(`Created new vocab with ID ${vocab.id}`);
        return vocab;
    }

    @Post('bulk/create')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.STAFF])
    @ApiOperation({ summary: 'Create multiple vocabs' })
    @ApiResponse({ status: HttpStatus.CREATED, type: VocabDto })
    public async createBulk(
        @Body() input: VocabInput[],
        @CurrentUser() user: User,
    ): Promise<VocabDto[]> {
        return this.vocabService.createBulk(input, user.id);
    }

    @Put(':id')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.STAFF])
    @ApiOperation({ summary: 'Update vocab' })
    @ApiResponse({ status: HttpStatus.OK, type: VocabDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Vocab not found' })
    public async update(
        @Param('id') id: string,
        @Body() updateVocabData: VocabInput,
        @CurrentUser() user: User,
    ): Promise<VocabDto> {
        const vocab = await this.vocabService.update(id, updateVocabData, user.id);
        this.logger.info(`Updated vocab with ID ${id}`);
        return vocab;
    }

    @Delete(':id')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.STAFF])
    @ApiOperation({ summary: 'Delete vocab' })
    @ApiResponse({ status: HttpStatus.OK, type: VocabDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Vocab not found' })
    public async delete(@Param('id') id: string, @CurrentUser() user: User): Promise<VocabDto> {
        const vocab = await this.vocabService.delete(id, user.id);
        this.logger.info(`Deleted vocab with ID ${id}`);
        return vocab;
    }

    @Post('bulk/delete')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.STAFF])
    @ApiOperation({ summary: 'Delete multiple vocabs' })
    @ApiResponse({ status: HttpStatus.OK, type: VocabDto })
    public async deleteBulk(@Body() ids: string[], @CurrentUser() user: User): Promise<VocabDto[]> {
        return this.vocabService.deleteBulk(ids, user.id);
    }

    @Post('import/csv')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.STAFF])
    @ApiOperation({ summary: 'Import vocabs from CSV file' })
    @ApiConsumes('multipart/form-data')
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    @ApiResponse({ status: HttpStatus.CREATED, type: CsvImportResponseDto })
    @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid CSV file or parameters' })
    public async importCsv(
        @Req() request: Request,
        @Query() queryParams: CsvImportQueryDto,
        @CurrentUser() user: User,
    ): Promise<CsvImportResponseDto> {
        try {
            // Get the multipart data from Express/multer
            const file = (request as RequestWithFile).file;

            if (!file) {
                throw new BadRequestException('CSV file is required');
            }

            // Validate file type
            if (!file.originalname?.toLowerCase().endsWith('.csv')) {
                throw new BadRequestException('File must be a CSV file');
            }

            // Read file buffer
            const buffer: Buffer = file.buffer;

            // Validate CSV headers
            if (!CsvParserUtil.validateCsvHeaders(buffer)) {
                throw new BadRequestException(
                    'Invalid CSV format. Required headers: textSource, textTarget. ' +
                        'Optional headers: wordType, grammar, explanationSource, explanationTarget, subjects, exampleSource, exampleTarget',
                );
            }

            // Parse CSV
            const { rows }: { rows: CsvRowData[] } = await CsvParserUtil.parseCsvBuffer(buffer);

            if (rows.length === 0) {
                throw new BadRequestException('CSV file is empty or contains no valid data');
            }

            // Import vocabs
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const result: CsvImportResponseDto = await this.vocabService.importFromCsv(
                rows,
                queryParams,
                user.id,
            );

            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            this.logger.info(
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                `CSV import completed for user ${user.id}: ${result.created} created, ${result.updated} updated, ${result.failed} failed`,
            );

            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return result;
        } catch (error: unknown) {
            if (error instanceof BadRequestException) {
                throw error;
            }
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`CSV import failed for user ${user.id}: ${errorMessage}`);
            throw new BadRequestException(errorMessage);
        }
    }
}
