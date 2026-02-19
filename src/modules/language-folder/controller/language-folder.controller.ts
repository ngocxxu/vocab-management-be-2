import {
    Body,
    Controller,
    Delete,
    Get,
    HttpStatus,
    Param,
    Post,
    Put,
    Query,
    UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { User, UserRole } from '@prisma/client';
import { IResponse, LoggerService, RolesGuard } from '../../common';
import { Roles, CurrentUser } from '../../common/decorator';
import { LanguageFolderPipe } from '../flow';
import { LanguageFolderDto, LanguageFolderInput } from '../model';
import { LanguageFolderParamsInput } from '../model/language-folder-params.input';
import { LanguageFolderService } from '../service';

@Controller('language-folders')
@ApiTags('language-folder')
@ApiBearerAuth()
export class LanguageFolderController {
    public constructor(
        private readonly logger: LoggerService,
        private readonly languageFolderService: LanguageFolderService,
    ) {}

    @Get()
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER])
    @ApiOperation({ summary: 'Find all language folders (admin only)' })
    @ApiResponse({ status: HttpStatus.OK, isArray: true, type: LanguageFolderDto })
    public async find(
        @Query() query: LanguageFolderParamsInput,
        @CurrentUser() user: User,
    ): Promise<IResponse<LanguageFolderDto[]>> {
        return this.languageFolderService.find(query, user.id);
    }

    @Get('my')
    @ApiOperation({ summary: 'Find all language folders for the current user' })
    @ApiResponse({ status: HttpStatus.OK, isArray: true, type: LanguageFolderDto })
    public async findMyFolders(@CurrentUser() user: User): Promise<IResponse<LanguageFolderDto[]>> {
        return this.languageFolderService.findByUserId(user.id);
    }

    @Get(':id')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER, UserRole.GUEST])
    @ApiOperation({ summary: 'Find language folder by ID' })
    @ApiResponse({ status: HttpStatus.OK, type: LanguageFolderDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Language folder not found' })
    public async findOne(@Param('id') id: string): Promise<LanguageFolderDto> {
        return this.languageFolderService.findOne(id);
    }

    @Post()
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER, UserRole.GUEST])
    @ApiOperation({ summary: 'Create language folder' })
    @ApiResponse({ status: HttpStatus.CREATED, type: LanguageFolderDto })
    public async create(
        @Body(LanguageFolderPipe) input: LanguageFolderInput,
        @CurrentUser() user: User,
    ): Promise<LanguageFolderDto> {
        const folder = await this.languageFolderService.create(input, user.id, user.role);
        this.logger.info(`Created new language folder with ID ${folder.id} for user ${user.id}`);
        return folder;
    }

    @Put(':id')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER, UserRole.GUEST])
    @ApiOperation({ summary: 'Update language folder' })
    @ApiResponse({ status: HttpStatus.OK, type: LanguageFolderDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Language folder not found' })
    @ApiResponse({
        status: HttpStatus.FORBIDDEN,
        description: 'You can only update your own language folders',
    })
    public async update(
        @Param('id') id: string,
        @Body(LanguageFolderPipe) updateFolderData: Partial<LanguageFolderInput>,
        @CurrentUser() user: User,
    ): Promise<LanguageFolderDto> {
        const folder = await this.languageFolderService.update(id, updateFolderData, user.id);
        this.logger.info(`Updated language folder with ID ${id} for user ${user.id}`);
        return folder;
    }

    @Delete(':id')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER, UserRole.GUEST])
    @ApiOperation({ summary: 'Delete language folder' })
    @ApiResponse({ status: HttpStatus.OK, type: LanguageFolderDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Language folder not found' })
    @ApiResponse({
        status: HttpStatus.FORBIDDEN,
        description: 'You can only delete your own language folders',
    })
    public async delete(
        @Param('id') id: string,
        @CurrentUser() user: User,
    ): Promise<LanguageFolderDto> {
        const folder = await this.languageFolderService.delete(id, user.id);
        this.logger.info(`Deleted language folder with ID ${id} for user ${user.id}`);
        return folder;
    }
}
