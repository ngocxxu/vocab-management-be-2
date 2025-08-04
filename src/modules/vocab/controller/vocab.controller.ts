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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { User, UserRole } from '@prisma/client';
import { LoggerService, RolesGuard } from '../../common';
import { CurrentUser, Roles } from '../../common/decorator';
import { PaginationDto } from '../../common/model/pagination.dto';
import { VocabDto, VocabInput } from '../model';
import { VocabQueryParamsInput } from '../model/vocab-query-params.input';
import { VocabService } from '../service';

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
    public async find(@Query() query: VocabQueryParamsInput): Promise<PaginationDto<VocabDto>> {
        return this.vocabService.find(query);
    }

    @Get('random/:count')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.STAFF])
    @ApiOperation({ summary: 'Find random vocab' })
    @ApiResponse({ status: HttpStatus.OK, type: VocabDto })
    public async findRandom(@Param('count') count: number): Promise<VocabDto[]> {
        return this.vocabService.findRandom(count);
    }

    @Get(':id')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.STAFF])
    @ApiOperation({ summary: 'Find vocab by ID' })
    @ApiResponse({ status: HttpStatus.OK, type: VocabDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Vocab not found' })
    public async findOne(@Param('id') id: string): Promise<VocabDto> {
        return this.vocabService.findOne(id);
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
    public async delete(@Param('id') id: string): Promise<VocabDto> {
        const vocab = await this.vocabService.delete(id);
        this.logger.info(`Deleted vocab with ID ${id}`);
        return vocab;
    }

    @Post('bulk/delete')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.STAFF])
    @ApiOperation({ summary: 'Delete multiple vocabs' })
    @ApiResponse({ status: HttpStatus.OK, type: VocabDto })
    public async deleteBulk(@Body() ids: string[]): Promise<VocabDto[]> {
        return this.vocabService.deleteBulk(ids);
    }
}
