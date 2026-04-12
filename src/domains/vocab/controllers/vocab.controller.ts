import { LoggerService, RolesGuard } from '@/shared';
import { CurrentUser, Roles } from '@/shared/decorators';
import { PaginationDto } from '@/shared/dto/pagination.dto';
import { Body, Controller, Delete, Get, HttpStatus, Param, ParseIntPipe, Post, Put, UseGuards, Query, BadRequestException, Req, Res, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags, ApiConsumes, ApiQuery } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { User, UserRole } from '@prisma/client';
import { Request, Response } from 'express';
import { AiService } from '../../ai/services/ai.service';
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
    VocabConflictBySubjectQuery,
} from '../dto';
import { BulkUpdateInput } from '../dto/bulk-update.input';
import { VocabQueryParamsInput } from '../dto/vocab-query-params.input';
import { VocabUpdateInput } from '../dto/vocab-update.input';
import { VocabService, VocabMasteryService } from '../services';
import { CsvParserUtil, CsvRowData } from '../utils/csv-parser.util';

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
    @Roles([UserRole.ADMIN, UserRole.MEMBER, UserRole.GUEST])
    @ApiOperation({ summary: 'Find all vocabs' })
    @ApiResponse({ status: HttpStatus.OK, type: VocabDto })
    public async find(@Query() query: VocabQueryParamsInput, @CurrentUser() user: User): Promise<PaginationDto<VocabDto>> {
        return this.vocabService.find(query, user.id);
    }

    @Get('random')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER, UserRole.GUEST])
    @ApiOperation({ summary: 'Find random vocab' })
    @ApiResponse({ status: HttpStatus.OK, type: VocabDto })
    @ApiQuery({ name: 'count', required: true, type: Number, example: 10 })
    @ApiQuery({ name: 'languageFolderId', required: false, type: String })
    public async findRandom(
        @Query('count', ParseIntPipe) count: number,
        @Query('languageFolderId') languageFolderId: string | undefined,
        @CurrentUser() user: User,
    ): Promise<VocabDto[]> {
        return this.vocabService.findRandom(count, user.id, languageFolderId);
    }

    @Get(':id')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER, UserRole.GUEST])
    @ApiOperation({ summary: 'Find vocab by ID' })
    @ApiResponse({ status: HttpStatus.OK, type: VocabDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Vocab not found' })
    public async findOne(@Param('id') id: string, @CurrentUser() user: User): Promise<VocabDto> {
        return this.vocabService.findOne(id, user.id);
    }

    @Post()
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER, UserRole.GUEST])
    @ApiOperation({ summary: 'Create vocab' })
    @ApiResponse({ status: HttpStatus.CREATED, type: VocabDto })
    public async create(@Body() input: VocabInput, @CurrentUser() user: User): Promise<VocabDto> {
        const vocab = await this.vocabService.create(input, user.id, user.role);
        this.logger.info(`Created new vocab with ID ${vocab.id}`);
        return vocab;
    }

    @Post('bulk/create')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER])
    @ApiOperation({ summary: 'Create multiple vocabs' })
    @ApiResponse({ status: HttpStatus.CREATED, type: VocabDto })
    public async createBulk(@Body() input: VocabInput[], @CurrentUser() user: User): Promise<VocabDto[]> {
        return this.vocabService.createBulk(input, user.id);
    }

    @Post('bulk/update')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER])
    @ApiOperation({ summary: 'Update multiple vocabs' })
    @ApiResponse({ status: HttpStatus.OK, type: [VocabDto] })
    public async updateBulk(@Body() input: BulkUpdateInput, @CurrentUser() user: User): Promise<VocabDto[]> {
        return this.vocabService.updateBulk(input, user.id);
    }

    @Get('conflict/by-subject')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER, UserRole.GUEST])
    @ApiOperation({ summary: 'Get vocabs using a specific subject (paginated)' })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'Paginated list of vocabs using the subject',
    })
    public async getConflictsBySubject(@Query() query: VocabConflictBySubjectQuery, @CurrentUser() user: User): Promise<PaginationDto<VocabDto>> {
        return this.vocabService.findConflictsBySubject(query, user.id);
    }

    @Post('generate/text-target')
    @Throttle({ default: { limit: 20, ttl: 60000 } })
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER])
    @ApiOperation({ summary: 'Generate text target content using AI' })
    @ApiResponse({ status: HttpStatus.OK, type: CreateTextTargetInput })
    @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid input parameters' })
    public async generateTextTarget(
        @Body()
        input: { textSource: string; sourceLanguageCode: string; targetLanguageCode: string },
        @CurrentUser() user: User,
    ): Promise<CreateTextTargetInput> {
        if (!input.textSource || !input.sourceLanguageCode || !input.targetLanguageCode) {
            throw new BadRequestException('textSource, sourceLanguageCode, and targetLanguageCode are required');
        }

        const result = await this.aiService.translateVocab(input.textSource, input.sourceLanguageCode, input.targetLanguageCode, undefined, user.id);

        this.logger.info(`Generated text target for user ${user.id}, textSource: ${input.textSource}`);
        return result;
    }

    @Put(':id')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER, UserRole.GUEST])
    @ApiOperation({ summary: 'Update vocab' })
    @ApiResponse({ status: HttpStatus.OK, type: VocabDto })
    public async update(@Param('id') id: string, @Body() updateVocabData: VocabUpdateInput, @CurrentUser() user: User): Promise<VocabDto> {
        const vocab = await this.vocabService.update(id, updateVocabData, user.id);
        this.logger.info(`Updated vocab with ID ${id}`);
        return vocab;
    }

    @Delete(':id')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER, UserRole.GUEST])
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
    @Roles([UserRole.ADMIN, UserRole.MEMBER, UserRole.GUEST])
    @ApiOperation({ summary: 'Delete multiple vocabs' })
    @ApiResponse({ status: HttpStatus.OK, type: VocabDto })
    public async deleteBulk(@Body() input: BulkDeleteInput, @CurrentUser() user: User): Promise<VocabDto[]> {
        return this.vocabService.deleteBulk(input, user.id);
    }

    @Post('import/csv')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER])
    @ApiOperation({ summary: 'Import vocabs from CSV file' })
    @ApiConsumes('multipart/form-data')
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    @ApiResponse({ status: HttpStatus.CREATED, type: CsvImportResponseDto })
    @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid CSV file or parameters' })
    @ApiResponse({ status: HttpStatus.REQUEST_TIMEOUT, description: 'Request timeout' })
    public async importCsv(@Req() request: Request, @Query() queryParams: CsvImportQueryDto, @CurrentUser() user: User): Promise<CsvImportResponseDto> {
        const startTime = Date.now();
        const file = (request as RequestWithFile).file;

        if (!file) {
            throw new BadRequestException('CSV file is required');
        }

        this.logger.info(`CSV import started for user ${user.id}, file: ${file.originalname}, size: ${file.size} bytes`);

        if (!file.originalname?.toLowerCase().endsWith('.csv')) {
            throw new BadRequestException('File must be a CSV file');
        }

        const buffer: Buffer = file.buffer;

        if (!CsvParserUtil.validateCsvHeaders(buffer)) {
            throw new BadRequestException(
                'Invalid CSV format. Required headers: textSource, textTarget. ' +
                    'Optional headers: wordType, grammar, explanationSource, explanationTarget, subjects, exampleSource, exampleTarget',
            );
        }

        const parseStartTime = Date.now();
        const { rows }: { rows: CsvRowData[] } = await CsvParserUtil.parseCsvBuffer(buffer);
        const parseDuration = Date.now() - parseStartTime;
        this.logger.info(`CSV parsed in ${parseDuration}ms, ${rows.length} rows found`);

        if (rows.length === 0) {
            throw new BadRequestException('CSV file is empty or contains no valid data');
        }

        const importStartTime = Date.now();
        const result: CsvImportResponseDto = await this.vocabService.importFromCsv(rows, queryParams, user.id);
        const importDuration = Date.now() - importStartTime;
        const totalDuration = Date.now() - startTime;

        this.logger.info(
            `CSV import for user ${user.id} in ${totalDuration}ms (import: ${importDuration}ms): ${result.created} created, ${result.updated} updated, ${result.failed} failed`,
        );

        return result;
    }

    @Get('export/csv')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER, UserRole.GUEST])
    @ApiOperation({ summary: 'Export vocabs to CSV file' })
    @ApiResponse({ status: HttpStatus.OK, description: 'CSV file download' })
    @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid query parameters' })
    public async exportCsv(@Query() query: VocabQueryParamsInput, @CurrentUser() user: User, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
        const csvBuffer: Buffer = await this.vocabService.exportToCsv(query, user.id);

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `vocabs-export-${timestamp}.csv`;

        res.set({
            'Content-Type': 'text/csv',
            'Content-Disposition': `attachment; filename="${filename}"`,
        });

        this.logger.info(`CSV export completed for user ${user.id}`);

        return new StreamableFile(csvBuffer);
    }

    @Get('statistics/summary')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER, UserRole.GUEST])
    @ApiOperation({ summary: 'Get mastery summary statistics' })
    @ApiResponse({ status: HttpStatus.OK, type: MasterySummaryDto })
    public async getMasterySummary(@CurrentUser() user: User): Promise<MasterySummaryDto> {
        const summary = await this.vocabMasteryService.getSummary(user.id);
        return new MasterySummaryDto(summary);
    }

    @Get('statistics/by-subject')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER, UserRole.GUEST])
    @ApiOperation({ summary: 'Get mastery scores grouped by subject' })
    @ApiResponse({ status: HttpStatus.OK, type: [MasteryBySubjectDto] })
    public async getMasteryBySubject(@CurrentUser() user: User): Promise<MasteryBySubjectDto[]> {
        const results = await this.vocabMasteryService.getMasteryBySubject(user.id);
        return results.map((r) => new MasteryBySubjectDto(r));
    }

    @Get('statistics/progress')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER, UserRole.GUEST])
    @ApiOperation({ summary: 'Get mastery progress over time' })
    @ApiResponse({ status: HttpStatus.OK, type: [ProgressOverTimeDto] })
    public async getProgressOverTime(@CurrentUser() user: User, @Query('startDate') startDate?: string, @Query('endDate') endDate?: string): Promise<ProgressOverTimeDto[]> {
        const start = startDate ? new Date(startDate) : undefined;
        const end = endDate ? new Date(endDate) : undefined;
        const results = await this.vocabMasteryService.getProgressOverTime(user.id, start, end);
        return results.map((r) => new ProgressOverTimeDto(r));
    }

    @Get('statistics/problematic')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER, UserRole.GUEST])
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
    @Roles([UserRole.ADMIN, UserRole.MEMBER, UserRole.GUEST])
    @ApiOperation({ summary: 'Get mastery score distribution' })
    @ApiResponse({ status: HttpStatus.OK, type: [MasteryDistributionDto] })
    public async getMasteryDistribution(@CurrentUser() user: User): Promise<MasteryDistributionDto[]> {
        const results = await this.vocabMasteryService.getMasteryDistribution(user.id);
        return results.map((r) => new MasteryDistributionDto(r));
    }
}
