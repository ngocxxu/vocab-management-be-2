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
import { IResponse, LoggerService, RolesGuard } from '../../common';
import { Roles } from '../../common/decorator';
import { WordTypeDto, WordTypeInput } from '../model';
import { WordTypeService } from '../service';

@Controller('word-types')
@ApiTags('word-type')
@ApiBearerAuth()
export class WordTypeController {
    public constructor(
        private readonly logger: LoggerService,
        private readonly wordTypeService: WordTypeService,
    ) {}

    @Get()
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER])
    @ApiOperation({ summary: 'Find all word types' })
    @ApiResponse({ status: HttpStatus.OK, isArray: true, type: WordTypeDto })
    public async find(): Promise<IResponse<WordTypeDto[]>> {
        return this.wordTypeService.find();
    }

    @Get(':id')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER])
    @ApiOperation({ summary: 'Find word type by ID' })
    @ApiResponse({ status: HttpStatus.OK, type: WordTypeDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Word type not found' })
    public async findOne(@Param('id') id: string): Promise<WordTypeDto> {
        return this.wordTypeService.findOne(id);
    }

    @Post()
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER])
    @ApiOperation({ summary: 'Create word type' })
    @ApiResponse({ status: HttpStatus.CREATED, type: WordTypeDto })
    public async create(@Body() input: WordTypeInput): Promise<WordTypeDto> {
        const wordType = await this.wordTypeService.create(input);
        this.logger.info(`Created new word type with ID ${wordType.id}`);
        return wordType;
    }

    @Put(':id')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER])
    @ApiOperation({ summary: 'Update word type' })
    @ApiResponse({ status: HttpStatus.OK, type: WordTypeDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Word type not found' })
    public async update(
        @Param('id') id: string,
        @Body() updateWordTypeData: WordTypeInput,
    ): Promise<WordTypeDto> {
        const wordType = await this.wordTypeService.update(id, updateWordTypeData);
        this.logger.info(`Updated word type with ID ${id}`);
        return wordType;
    }

    @Delete(':id')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER])
    @ApiOperation({ summary: 'Delete word type' })
    @ApiResponse({ status: HttpStatus.OK, type: WordTypeDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Word type not found' })
    public async delete(@Param('id') id: string): Promise<WordTypeDto> {
        const wordType = await this.wordTypeService.delete(id);
        this.logger.info(`Deleted word type with ID ${id}`);
        return wordType;
    }
}
