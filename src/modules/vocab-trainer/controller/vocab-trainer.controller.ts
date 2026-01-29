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
    UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { QuestionType, User, UserRole } from '@prisma/client';
import { LoggerService, RolesGuard } from '../../common';
import { Roles } from '../../common/decorator';
import { CurrentUser } from '../../common/decorator/user.decorator';
import { PaginationDto } from '../../common/model/pagination.dto';
import { VocabTrainerPipe } from '../flow/vocab-trainer.pipe';
import { VocabTrainerDto, VocabTrainerInput, SubmitTranslationAudioResponseDto } from '../model';
import { SubmitFillInBlankInput } from '../model/submit-fill-in-blank.dto';
import { SubmitMultipleChoiceInput } from '../model/submit-multiple-choice.dto';
import { SubmitTranslationAudioInput } from '../model/submit-translation-audio.dto';
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
    @Roles([UserRole.ADMIN, UserRole.MEMBER])
    @UsePipes(VocabTrainerPipe)
    @ApiOperation({ summary: 'Find all vocab trainers' })
    @ApiResponse({ status: HttpStatus.OK, type: PaginationDto })
    public async find(
        @Query() query: VocabTrainerQueryParamsInput,
        @CurrentUser() user: User,
    ): Promise<PaginationDto<VocabTrainerDto>> {
        return this.vocabTrainerService.find(query, user.id);
    }

    @Get(':id')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER])
    @ApiOperation({ summary: 'Find vocab trainer by ID' })
    @ApiResponse({ status: HttpStatus.OK, type: VocabTrainerDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Vocab trainer not found' })
    public async findOne(
        @Param('id') id: string,
        @CurrentUser() user: User,
    ): Promise<VocabTrainerDto> {
        return this.vocabTrainerService.findOne(id, user.id);
    }

    @Get(':id/exam')
    @Throttle({ default: { limit: 20, ttl: 60000 } })
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER])
    @ApiOperation({ summary: 'Find vocab trainer by ID and exam' })
    @ApiResponse({ status: HttpStatus.OK, type: VocabTrainerDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Exam of vocab trainer not found' })
    public async findOneAndExam(
        @Param('id') id: string,
        @CurrentUser() user: User,
    ): Promise<VocabTrainerDto> {
        return this.vocabTrainerService.findOneAndExam(id, user.id);
    }

    @Patch(':id/exam')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER])
    @ApiOperation({ summary: 'Submit exam' })
    @ApiResponse({ status: HttpStatus.OK, type: VocabTrainerDto })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'For TRANSLATION_AUDIO, returns SubmitTranslationAudioResponseDto',
        type: SubmitTranslationAudioResponseDto,
    })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Exam of vocab trainer not found' })
    public async submitExam(
        @Param('id') id: string,
        @Body()
        input: SubmitMultipleChoiceInput | SubmitFillInBlankInput | SubmitTranslationAudioInput,
        @CurrentUser() user: User,
    ): Promise<VocabTrainerDto | SubmitTranslationAudioResponseDto> {
        if (input.questionType === QuestionType.MULTIPLE_CHOICE) {
            return this.vocabTrainerService.submitMultipleChoice(
                id,
                input as SubmitMultipleChoiceInput,
                user,
            );
        } else if (input.questionType === QuestionType.FILL_IN_THE_BLANK) {
            return this.vocabTrainerService.submitFillInBlank(
                id,
                input as SubmitFillInBlankInput,
                user,
            );
        } else if (input.questionType === QuestionType.TRANSLATION_AUDIO) {
            return this.vocabTrainerService.submitTranslationAudio(
                id,
                input as SubmitTranslationAudioInput,
                user,
            );
        } else {
            throw new BadRequestException('Question type is not suitable');
        }
    }

    @Post()
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER])
    @ApiOperation({ summary: 'Create vocab trainer' })
    @ApiResponse({ status: HttpStatus.CREATED, type: VocabTrainerDto })
    public async create(
        @Body() input: VocabTrainerInput,
        @CurrentUser() user: User,
    ): Promise<VocabTrainerDto> {
        const trainer = await this.vocabTrainerService.create(input, user.id);
        this.logger.info(`Created new vocab trainer with ID ${trainer.id}`);
        return trainer;
    }

    @Put(':id')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER])
    @ApiOperation({ summary: 'Update vocab trainer' })
    @ApiResponse({ status: HttpStatus.OK, type: VocabTrainerDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Vocab trainer not found' })
    public async update(
        @Param('id') id: string,
        @Body() updateTrainerData: UpdateVocabTrainerInput,
        @CurrentUser() user: User,
    ): Promise<VocabTrainerDto> {
        const trainer = await this.vocabTrainerService.update(id, updateTrainerData, user.id);
        this.logger.info(`Updated vocab trainer with ID ${id}`);
        return trainer;
    }

    @Delete(':id')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER])
    @ApiOperation({ summary: 'Delete vocab trainer' })
    @ApiResponse({ status: HttpStatus.OK, type: VocabTrainerDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Vocab trainer not found' })
    public async delete(
        @Param('id') id: string,
        @CurrentUser() user: User,
    ): Promise<VocabTrainerDto> {
        const trainer = await this.vocabTrainerService.delete(id, user.id);
        this.logger.info(`Deleted vocab trainer with ID ${id}`);
        return trainer;
    }

    @Post('bulk/delete')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER])
    @ApiOperation({ summary: 'Delete multiple vocab trainers' })
    @ApiResponse({ status: HttpStatus.OK, type: VocabTrainerDto })
    public async deleteBulk(
        @Body() body: { ids: string[] },
        @CurrentUser() user: User,
    ): Promise<VocabTrainerDto[]> {
        return this.vocabTrainerService.deleteBulk(body.ids, user.id);
    }
}
