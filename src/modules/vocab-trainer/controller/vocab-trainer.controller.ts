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
    Patch,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { QuestionType, User, UserRole } from '@prisma/client';
import { LoggerService, RolesGuard } from '../../common';
import { Roles } from '../../common/decorator';
import { CurrentUser } from '../../common/decorator/user.decorator';
import { PaginationDto } from '../../common/model/pagination.dto';
import { VocabTrainerDto, VocabTrainerInput } from '../model';
import { SubmitMultipleChoiceInput } from '../model/submit-multiple-choice.dto';
import { UpdateVocabTrainerInput } from '../model/update-vocab-trainer.input';
import { VocabTrainerQueryParamsInput } from '../model/vocab-trainer-query-params.input';
import { VocabTrainerService } from '../service';

@Controller('vocab-trainers')
@ApiTags('vocab-trainer')
@ApiBearerAuth()
export class VocabTrainerController {
    public constructor(
        private readonly logger: LoggerService,
        private readonly vocabTrainerService: VocabTrainerService,
    ) {}

    @Get()
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.STAFF])
    @ApiOperation({ summary: 'Find all vocab trainers' })
    @ApiResponse({ status: HttpStatus.OK, type: PaginationDto })
    public async find(@Query() query: VocabTrainerQueryParamsInput): Promise<PaginationDto<VocabTrainerDto>> {
        return this.vocabTrainerService.find(query);
    }

    @Get(':id')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.STAFF])
    @ApiOperation({ summary: 'Find vocab trainer by ID' })
    @ApiResponse({ status: HttpStatus.OK, type: VocabTrainerDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Vocab trainer not found' })
    public async findOne(@Param('id') id: string): Promise<VocabTrainerDto> {
        return this.vocabTrainerService.findOne(id);
    };

    @Get(':id/exam')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.STAFF])
    @ApiOperation({ summary: 'Find vocab trainer by ID and exam' })
    @ApiResponse({ status: HttpStatus.OK, type: VocabTrainerDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Exam of vocab trainer not found' })
    public async findOneAndExam(@Param('id') id: string): Promise<VocabTrainerDto> {
        return this.vocabTrainerService.findOneAndExam(id);
    }

    @Patch(':id/exam')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.STAFF])
    @ApiOperation({ summary: 'Submit exam' })
    @ApiResponse({ status: HttpStatus.OK, type: VocabTrainerDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Exam of vocab trainer not found' })
    public async submitExam(@Param('id') id: string, @Body() input: SubmitMultipleChoiceInput, @CurrentUser() user: User): Promise<VocabTrainerDto> {
        if (input.questionType === QuestionType.MULTIPLE_CHOICE) {
            return this.vocabTrainerService.submitMultipleChoice(id, input, user);
        }
        else {
            throw new BadRequestException('Question type is not suitable');
        }
    }

    @Post()
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.STAFF])
    @ApiOperation({ summary: 'Create vocab trainer' })
    @ApiResponse({ status: HttpStatus.CREATED, type: VocabTrainerDto })
    public async create(@Body() input: VocabTrainerInput, @CurrentUser() user: User): Promise<VocabTrainerDto> {
        const trainer = await this.vocabTrainerService.create(input, user.id);
        this.logger.info(`Created new vocab trainer with ID ${trainer.id}`);
        return trainer;
    }

    @Put(':id')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.STAFF])
    @ApiOperation({ summary: 'Update vocab trainer' })
    @ApiResponse({ status: HttpStatus.OK, type: VocabTrainerDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Vocab trainer not found' })
    public async update(
        @Param('id') id: string,
        @Body() updateTrainerData: UpdateVocabTrainerInput,
    ): Promise<VocabTrainerDto> {
        const trainer = await this.vocabTrainerService.update(id, updateTrainerData);
        this.logger.info(`Updated vocab trainer with ID ${id}`);
        return trainer;
    }

    @Delete(':id')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.STAFF])
    @ApiOperation({ summary: 'Delete vocab trainer' })
    @ApiResponse({ status: HttpStatus.OK, type: VocabTrainerDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Vocab trainer not found' })
    public async delete(@Param('id') id: string): Promise<VocabTrainerDto> {
        const trainer = await this.vocabTrainerService.delete(id);
        this.logger.info(`Deleted vocab trainer with ID ${id}`);
        return trainer;
    }

    @Delete('bulk/delete')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.STAFF])
    @ApiOperation({ summary: 'Delete multiple vocab trainers' })
    @ApiResponse({ status: HttpStatus.OK, type: VocabTrainerDto })
    public async deleteBulk(@Body() ids: string[]): Promise<VocabTrainerDto[]> {
        return this.vocabTrainerService.deleteBulk(ids);
    }
}