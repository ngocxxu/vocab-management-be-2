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
import { User, UserRole } from '@prisma/client';
import { IResponse, LoggerService, RolesGuard } from '../../common';
import { CurrentUser, Roles } from '../../common/decorator';
import { SubjectDto, SubjectInput } from '../model';
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
    @Roles([UserRole.ADMIN, UserRole.STAFF])
    @ApiOperation({ summary: 'Find all subjects' })
    @ApiResponse({ status: HttpStatus.OK, isArray: true, type: SubjectDto })
    public async find(@CurrentUser() user: User): Promise<IResponse<SubjectDto[]>> {
        return this.subjectService.find(user.id);
    }

    @Get(':id')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.STAFF])
    @ApiOperation({ summary: 'Find subject by ID' })
    @ApiResponse({ status: HttpStatus.OK, type: SubjectDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Subject not found' })
    public async findOne(@Param('id') id: string): Promise<SubjectDto> {
        return this.subjectService.findOne(id);
    }

    @Post()
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.STAFF])
    @ApiOperation({ summary: 'Create subject' })
    @ApiResponse({ status: HttpStatus.CREATED, type: SubjectDto })
    public async create(@Body() input: CreateSubjectInput, @CurrentUser() user: User): Promise<SubjectDto> {
        const subject = await this.subjectService.create(input, user.id);
        this.logger.info(`Created new subject with ID ${subject.id}`);
        return subject;
    }

    @Put(':id')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.STAFF])
    @ApiOperation({ summary: 'Update subject' })
    @ApiResponse({ status: HttpStatus.OK, type: SubjectDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Subject not found' })
    public async update(
        @Param('id') id: string,
        @Body() updateSubjectData: SubjectInput,
    ): Promise<SubjectDto> {
        const subject = await this.subjectService.update(id, updateSubjectData);
        this.logger.info(`Updated subject with ID ${id}`);
        return subject;
    }

    @Delete(':id')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.STAFF])
    @ApiOperation({ summary: 'Delete subject' })
    @ApiResponse({ status: HttpStatus.OK, type: SubjectDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Subject not found' })
    public async delete(@Param('id') id: string): Promise<SubjectDto> {
        const subject = await this.subjectService.delete(id);
        this.logger.info(`Deleted subject with ID ${id}`);
        return subject;
    }
}
