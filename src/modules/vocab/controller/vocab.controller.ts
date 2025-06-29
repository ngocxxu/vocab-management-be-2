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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { LoggerService, RolesGuard } from '../../common';
import { Roles } from '../../common/decorator/roles.decorator';
import { VocabDto, VocabInput } from '../model';
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
    @ApiResponse({ status: HttpStatus.OK, isArray: true, type: VocabDto })
    public async find(): Promise<VocabDto[]> {
        return this.vocabService.find();
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
    public async create(@Body() input: VocabInput): Promise<VocabDto> {
        // In a real application, you would get the userId from the authentication context
        const vocab = await this.vocabService.create(input);
        this.logger.info(`Created new vocab with ID ${vocab.id}`);
        return vocab;
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
    ): Promise<VocabDto> {
        const vocab = await this.vocabService.update(id, updateVocabData);
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
}
