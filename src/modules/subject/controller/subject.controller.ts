import {
    Body,
    Controller,
    Delete,
    Get,
    HttpStatus,
    Param,
    Patch,
    Post,
    Put,
    UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { User, UserRole } from '@prisma/client';
import { IResponse, LoggerService, RolesGuard } from '../../common';
import { CurrentUser, Roles } from '../../common/decorator';
import { ReorderSubjectInput, SubjectDto, SubjectInput } from '../model';
import { CreateSubjectInput } from '../model/create-subject.input';
import { SubjectService } from '../service';

@Controller('subjects')
@ApiTags('subject')
@ApiBearerAuth()
export class SubjectController {
    public constructor(
        private readonly logger: LoggerService,
        private readonly subjectService: SubjectService,
    ) {}

    @Get()
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER, UserRole.GUEST])
    @ApiOperation({ summary: 'Find all subjects' })
    @ApiResponse({ status: HttpStatus.OK, isArray: true, type: SubjectDto })
    public async find(@CurrentUser() user: User): Promise<IResponse<SubjectDto[]>> {
        return this.subjectService.find(user.id);
    }

    @Get(':id')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER, UserRole.GUEST])
    @ApiOperation({ summary: 'Find subject by ID' })
    @ApiResponse({ status: HttpStatus.OK, type: SubjectDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Subject not found' })
    public async findOne(@Param('id') id: string, @CurrentUser() user: User): Promise<SubjectDto> {
        return this.subjectService.findOne(id, user.id);
    }

    @Post()
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER, UserRole.GUEST])
    @ApiOperation({ summary: 'Create subject' })
    @ApiResponse({ status: HttpStatus.CREATED, type: SubjectDto })
    public async create(
        @Body() input: CreateSubjectInput,
        @CurrentUser() user: User,
    ): Promise<SubjectDto> {
        const subject = await this.subjectService.create(input, user.id);
        this.logger.info(`Created new subject with ID ${subject.id}`);
        return subject;
    }

    @Put(':id')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER, UserRole.GUEST])
    @ApiOperation({ summary: 'Update subject' })
    @ApiResponse({ status: HttpStatus.OK, type: SubjectDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Subject not found' })
    public async update(
        @Param('id') id: string,
        @Body() updateSubjectData: SubjectInput,
        @CurrentUser() user: User,
    ): Promise<SubjectDto> {
        const subject = await this.subjectService.update(id, updateSubjectData, user.id);
        this.logger.info(`Updated subject with ID ${id}`);
        return subject;
    }

    @Patch('reorder')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER, UserRole.GUEST])
    @ApiOperation({ summary: 'Reorder subjects' })
    @ApiResponse({ status: HttpStatus.OK, isArray: true, type: SubjectDto })
    public async reorder(
        @Body() input: ReorderSubjectInput,
        @CurrentUser() user: User,
    ): Promise<SubjectDto[]> {
        return this.subjectService.reorder(input, user.id);
    }

    @Delete(':id')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER, UserRole.GUEST])
    @ApiOperation({ summary: 'Delete subject' })
    @ApiResponse({ status: HttpStatus.OK, type: SubjectDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Subject not found' })
    public async delete(@Param('id') id: string, @CurrentUser() user: User): Promise<SubjectDto> {
        const subject = await this.subjectService.delete(id, user.id);
        this.logger.info(`Deleted subject with ID ${id}`);
        return subject;
    }
}
