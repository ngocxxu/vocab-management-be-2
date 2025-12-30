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
    Res,
    StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags, ApiConsumes } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { User, UserRole } from '@prisma/client';
import { Request, Response } from 'express';
import { AiService } from '../../ai/service/ai.service';
import { LoggerService, RolesGuard } from '../../common';
import { CurrentUser, Roles } from '../../common/decorator';
import { PaginationDto } from '../../common/model/pagination.dto';
import {
    VocabDto,
    VocabInput,
    CsvImportQueryDto,
    CsvImportResponseDto,
    BulkDeleteInput,
    MasterySummaryDto,
    MasteryBySubjectDto,
    ProgressOverTimeDto,
    TopProblematicVocabDto,
    MasteryDistributionDto,
    CreateTextTargetInput,
} from '../model';
import { VocabQueryParamsInput } from '../model/vocab-query-params.input';
import { VocabService, VocabMasteryService } from '../service';
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
        private readonly vocabMasteryService: VocabMasteryService,
        private readonly aiService: AiService,
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

    @Post('generate/text-target')
    @Throttle({ default: { limit: 20, ttl: 60000 } })
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.STAFF])
    @ApiOperation({ summary: 'Generate text target content using AI' })
    @ApiResponse({ status: HttpStatus.OK, type: CreateTextTargetInput })
    @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid input parameters' })
    public async generateTextTarget(
        @Body()
        input: { textSource: string; sourceLanguageCode: string; targetLanguageCode: string },
        @CurrentUser() user: User,
    ): Promise<CreateTextTargetInput> {
        if (!input.textSource || !input.sourceLanguageCode || !input.targetLanguageCode) {
            throw new BadRequestException(
                'textSource, sourceLanguageCode, and targetLanguageCode are required',
            );
        }

        try {
            const result = await this.aiService.translateVocab(
                input.textSource,
                input.sourceLanguageCode,
                input.targetLanguageCode,
                undefined,
                user.id,
            );

            this.logger.info(
                `Generated text target for user ${user.id}, textSource: ${input.textSource}`,
            );
            return result;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(
                `Failed to generate text target for user ${user.id}: ${errorMessage}`,
            );
            throw new BadRequestException(`Failed to generate text target: ${errorMessage}`);
        }
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
    public async deleteBulk(
        @Body() input: BulkDeleteInput,
        @CurrentUser() user: User,
    ): Promise<VocabDto[]> {
        return this.vocabService.deleteBulk(input, user.id);
    }

    @Post('import/csv')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.STAFF])
    @ApiOperation({ summary: 'Import vocabs from CSV file' })
    @ApiConsumes('multipart/form-data')
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    @ApiResponse({ status: HttpStatus.CREATED, type: CsvImportResponseDto })
    @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid CSV file or parameters' })
    @ApiResponse({ status: HttpStatus.REQUEST_TIMEOUT, description: 'Request timeout' })
    public async importCsv(
        @Req() request: Request,
        @Query() queryParams: CsvImportQueryDto,
        @CurrentUser() user: User,
    ): Promise<CsvImportResponseDto> {
        const startTime = Date.now();
        try {
            // Get the multipart data from Express/multer
            const file = (request as RequestWithFile).file;

            if (!file) {
                throw new BadRequestException('CSV file is required');
            }

            this.logger.info(
                `CSV import started for user ${user.id}, file: ${file.originalname}, size: ${file.size} bytes`,
            );

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
            const parseStartTime = Date.now();
            const { rows }: { rows: CsvRowData[] } = await CsvParserUtil.parseCsvBuffer(buffer);
            const parseDuration = Date.now() - parseStartTime;
            this.logger.info(`CSV parsed in ${parseDuration}ms, ${rows.length} rows found`);

            if (rows.length === 0) {
                throw new BadRequestException('CSV file is empty or contains no valid data');
            }

            // Import vocabs
            const importStartTime = Date.now();
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const result: CsvImportResponseDto = await this.vocabService.importFromCsv(
                rows,
                queryParams,
                user.id,
            );
            const importDuration = Date.now() - importStartTime;
            const totalDuration = Date.now() - startTime;

            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            this.logger.info(
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                `CSV import for user ${user.id} in ${totalDuration}ms (import: ${importDuration}ms): ${result.created} created, ${result.updated} updated, ${result.failed} failed`,
            );

            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return result;
        } catch (error: unknown) {
            const duration = Date.now() - startTime;
            if (error instanceof BadRequestException) {
                this.logger.warn(
                    `CSV import failed for user ${user.id} after ${duration}ms: ${error.message}`,
                );
                throw error;
            }
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(
                `CSV import failed for user ${user.id} after ${duration}ms: ${errorMessage}`,
            );
            throw new BadRequestException(
                `Failed to import CSV: ${errorMessage}. If the file is large, this may take several minutes.`,
            );
        }
    }

    @Get('export/csv')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.STAFF])
    @ApiOperation({ summary: 'Export vocabs to CSV file' })
    @ApiResponse({ status: HttpStatus.OK, description: 'CSV file download' })
    @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid query parameters' })
    public async exportCsv(
        @Query() query: VocabQueryParamsInput,
        @CurrentUser() user: User,
        @Res({ passthrough: true }) res: Response,
    ): Promise<StreamableFile> {
        try {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
            const csvBuffer: Buffer = await this.vocabService.exportToCsv(query, user.id);

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `vocabs-export-${timestamp}.csv`;

            res.set({
                'Content-Type': 'text/csv',
                'Content-Disposition': `attachment; filename="${filename}"`,
            });

            this.logger.info(`CSV export completed for user ${user.id}`);

            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
            return new StreamableFile(csvBuffer);
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`CSV export failed for user ${user.id}: ${errorMessage}`);
            throw new BadRequestException(errorMessage);
        }
    }

    @Get('statistics/summary')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.STAFF])
    @ApiOperation({ summary: 'Get mastery summary statistics' })
    @ApiResponse({ status: HttpStatus.OK, type: MasterySummaryDto })
    public async getMasterySummary(@CurrentUser() user: User): Promise<MasterySummaryDto> {
        const summary = await this.vocabMasteryService.getSummary(user.id);
        return new MasterySummaryDto(summary);
    }

    @Get('statistics/by-subject')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.STAFF])
    @ApiOperation({ summary: 'Get mastery scores grouped by subject' })
    @ApiResponse({ status: HttpStatus.OK, type: [MasteryBySubjectDto] })
    public async getMasteryBySubject(@CurrentUser() user: User): Promise<MasteryBySubjectDto[]> {
        const results = await this.vocabMasteryService.getMasteryBySubject(user.id);
        return results.map((r) => new MasteryBySubjectDto(r));
    }

    @Get('statistics/progress')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.STAFF])
    @ApiOperation({ summary: 'Get mastery progress over time' })
    @ApiResponse({ status: HttpStatus.OK, type: [ProgressOverTimeDto] })
    public async getProgressOverTime(
        @CurrentUser() user: User,
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
    ): Promise<ProgressOverTimeDto[]> {
        const start = startDate ? new Date(startDate) : undefined;
        const end = endDate ? new Date(endDate) : undefined;
        const results = await this.vocabMasteryService.getProgressOverTime(user.id, start, end);
        return results.map((r) => new ProgressOverTimeDto(r));
    }

    @Get('statistics/problematic')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.STAFF])
    @ApiOperation({ summary: 'Get top problematic vocabs' })
    @ApiResponse({ status: HttpStatus.OK, type: [TopProblematicVocabDto] })
    public async getTopProblematicVocabs(
        @CurrentUser() user: User,
        @Query('minIncorrect') minIncorrect?: number,
        @Query('limit') limit?: number,
    ): Promise<TopProblematicVocabDto[]> {
        const min = minIncorrect ? Number(minIncorrect) : 5;
        const lim = limit ? Number(limit) : 10;
        const results = await this.vocabMasteryService.getTopProblematicVocabs(user.id, min, lim);
        return results.map((r) => new TopProblematicVocabDto(r));
    }

    @Get('statistics/distribution')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.STAFF])
    @ApiOperation({ summary: 'Get mastery score distribution' })
    @ApiResponse({ status: HttpStatus.OK, type: [MasteryDistributionDto] })
    public async getMasteryDistribution(
        @CurrentUser() user: User,
    ): Promise<MasteryDistributionDto[]> {
        const results = await this.vocabMasteryService.getMasteryDistribution(user.id);
        return results.map((r) => new MasteryDistributionDto(r));
    }
}
