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
import { LanguageDto, LanguageInput } from '../model';
import { LanguageService } from '../service';

@Controller('languages')
@ApiTags('language')
@ApiBearerAuth()
export class LanguageController {
    public constructor(
        private readonly logger: LoggerService,
        private readonly languageService: LanguageService,
    ) {}

    @Get()
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.STAFF])
    @ApiOperation({ summary: 'Find all languages' })
    @ApiResponse({ status: HttpStatus.OK, isArray: true, type: LanguageDto })
    public async find(): Promise<LanguageDto[]> {
        return this.languageService.find();
    }

    @Get(':id')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.STAFF])
    @ApiOperation({ summary: 'Find language by ID' })
    @ApiResponse({ status: HttpStatus.OK, type: LanguageDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Language not found' })
    public async findOne(@Param('id') id: string): Promise<LanguageDto> {
        return this.languageService.findOne(id);
    }

    @Post()
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.STAFF])
    @ApiOperation({ summary: 'Create language' })
    @ApiResponse({ status: HttpStatus.CREATED, type: LanguageDto })
    public async create(@Body() input: LanguageInput): Promise<LanguageDto> {
        const language = await this.languageService.create(input);
        this.logger.info(`Created new language with ID ${language.id}`);
        return language;
    }

    @Put(':id')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.STAFF])
    @ApiOperation({ summary: 'Update language' })
    @ApiResponse({ status: HttpStatus.OK, type: LanguageDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Language not found' })
    public async update(
        @Param('id') id: string,
        @Body() updateLanguageData: LanguageInput,
    ): Promise<LanguageDto> {
        const language = await this.languageService.update(id, updateLanguageData);
        this.logger.info(`Updated language with ID ${id}`);
        return language;
    }

    @Delete(':id')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.STAFF])
    @ApiOperation({ summary: 'Delete language' })
    @ApiResponse({ status: HttpStatus.OK, type: LanguageDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Language not found' })
    public async delete(@Param('id') id: string): Promise<LanguageDto> {
        const language = await this.languageService.delete(id);
        this.logger.info(`Deleted language with ID ${id}`);
        return language;
    }
}
