import type { FsrsReviewQueue, FsrsReviewResult, FsrsReviewSummary } from '@/domains/vocab/types';
import type { AnswerCheck } from '@/domains/vocab/utils/fsrs-answer-check.util';
import { LoggerService, RolesGuard } from '@/shared';
import { Roles } from '@/shared/decorators';
import { CurrentUser } from '@/shared/decorators/user.decorator';
import { PaginationDto } from '@/shared/dto/pagination.dto';
import { Body, Controller, Delete, Get, HttpStatus, Param, Post, Put, UseGuards, Query, BadRequestException, Patch, UsePipes } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { QuestionType, User, UserRole } from '@prisma/client';
import { FsrsSessionService } from '../../vocab/services/fsrs-session.service';
import {
    FsrsReviewAnswerInput,
    FsrsReviewCheckInput,
    FsrsReviewQueueQueryInput,
    UpdateFsrsSettingsInput,
    VocabTrainerDeleteBulkInput,
    VocabTrainerDto,
    VocabTrainerInput,
    SubmitTranslationAudioResponseDto,
} from '../dto';
import { SubmitExamBodyInput } from '../dto/submit-exam.dto';
import { SubmitFillInBlankChoiceInput } from '../dto/submit-fill-in-blank-choice.dto';
import { SubmitFillInBlankInput } from '../dto/submit-fill-in-blank.dto';
import { SubmitMultipleChoiceInput } from '../dto/submit-multiple-choice.dto';
import { SubmitTranslationAudioInput } from '../dto/submit-translation-audio.dto';
import { UpdateVocabTrainerInput } from '../dto/update-vocab-trainer.input';
import { VocabTrainerQueryParamsInput } from '../dto/vocab-trainer-query-params.input';
import { VocabTrainerPipe } from '../pipes/vocab-trainer.pipe';
import { VocabTrainerService } from '../services';

@Controller('vocab-trainers')
@ApiTags('vocab-trainer')
@ApiBearerAuth()
export class VocabTrainerController {
    public constructor(
        private readonly logger: LoggerService,
        private readonly vocabTrainerService: VocabTrainerService,
        private readonly fsrsSessionService: FsrsSessionService,
    ) {}

    @Get()
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER, UserRole.GUEST])
    @UsePipes(VocabTrainerPipe)
    @ApiOperation({ summary: 'Find all vocab trainers' })
    @ApiResponse({ status: HttpStatus.OK, type: PaginationDto })
    public async find(@Query() query: VocabTrainerQueryParamsInput, @CurrentUser() user: User): Promise<PaginationDto<VocabTrainerDto>> {
        return this.vocabTrainerService.find(query, user.id);
    }

    @Get(':id')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER, UserRole.GUEST])
    @ApiOperation({ summary: 'Find vocab trainer by ID' })
    @ApiResponse({ status: HttpStatus.OK, type: VocabTrainerDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Vocab trainer not found' })
    public async findOne(@Param('id') id: string, @CurrentUser() user: User): Promise<VocabTrainerDto> {
        return this.vocabTrainerService.findOne(id, user.id);
    }

    @Get(':id/exam')
    @Throttle({ default: { limit: 20, ttl: 60000 } })
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER, UserRole.GUEST])
    @ApiOperation({ summary: 'Find vocab trainer by ID and exam' })
    @ApiResponse({ status: HttpStatus.OK, type: VocabTrainerDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Exam of vocab trainer not found' })
    public async findOneAndExam(@Param('id') id: string, @CurrentUser() user: User): Promise<VocabTrainerDto> {
        return this.vocabTrainerService.findOneAndExam(id, user.id);
    }

    @Patch(':id/exam')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER, UserRole.GUEST])
    @ApiOperation({ summary: 'Submit exam' })
    @ApiResponse({ status: HttpStatus.OK, type: VocabTrainerDto })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'For TRANSLATION_AUDIO, returns SubmitTranslationAudioResponseDto',
        type: SubmitTranslationAudioResponseDto,
    })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Exam of vocab trainer not found' })
    public async submitExam(@Param('id') id: string, @Body() input: SubmitExamBodyInput, @CurrentUser() user: User): Promise<VocabTrainerDto | SubmitTranslationAudioResponseDto> {
        if (input.questionType === QuestionType.MULTIPLE_CHOICE) {
            return this.vocabTrainerService.submitMultipleChoice(id, input as SubmitMultipleChoiceInput, user);
        } else if (input.questionType === QuestionType.FILL_IN_BLANK_CHOICE) {
            return this.vocabTrainerService.submitFillInBlankChoice(id, input as SubmitFillInBlankChoiceInput, user);
        } else if (input.questionType === QuestionType.FILL_IN_THE_BLANK) {
            return this.vocabTrainerService.submitFillInBlank(id, input as SubmitFillInBlankInput, user);
        } else if (input.questionType === QuestionType.TRANSLATION_AUDIO && user.role !== UserRole.GUEST) {
            return this.vocabTrainerService.submitTranslationAudio(id, input as SubmitTranslationAudioInput, user);
        } else {
            throw new BadRequestException('Question type is not suitable');
        }
    }

    @Post()
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER, UserRole.GUEST])
    @ApiOperation({ summary: 'Create vocab trainer' })
    @ApiResponse({ status: HttpStatus.CREATED, type: VocabTrainerDto })
    public async create(@Body() input: VocabTrainerInput, @CurrentUser() user: User): Promise<VocabTrainerDto> {
        const trainer = await this.vocabTrainerService.create(input, user.id);
        this.logger.info(`Created new vocab trainer with ID ${trainer.id}`);
        return trainer;
    }

    @Put(':id')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER, UserRole.GUEST])
    @ApiOperation({ summary: 'Update vocab trainer' })
    @ApiResponse({ status: HttpStatus.OK, type: VocabTrainerDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Vocab trainer not found' })
    public async update(@Param('id') id: string, @Body() updateTrainerData: UpdateVocabTrainerInput, @CurrentUser() user: User): Promise<VocabTrainerDto> {
        const trainer = await this.vocabTrainerService.update(id, updateTrainerData, user.id);
        this.logger.info(`Updated vocab trainer with ID ${id}`);
        return trainer;
    }

    @Patch(':id')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER, UserRole.GUEST])
    @ApiOperation({ summary: 'Change the settings of an FSRS trainer (mode and directions are fixed at creation)' })
    @ApiResponse({ status: HttpStatus.OK, type: VocabTrainerDto })
    @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Not an FSRS trainer, or a value is not allowed' })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Vocab trainer not found' })
    public async updateFsrsSettings(@Param('id') id: string, @Body() input: UpdateFsrsSettingsInput, @CurrentUser() user: User): Promise<VocabTrainerDto> {
        const trainer = await this.vocabTrainerService.updateFsrsSettings(id, input, user.id);
        this.logger.info(`Updated FSRS settings of vocab trainer with ID ${id}`);
        return trainer;
    }

    @Get(':id/review-queue')
    @Throttle({ default: { limit: 30, ttl: 60000 } })
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER, UserRole.GUEST])
    @ApiOperation({ summary: 'The cards of one FSRS review session: due first, then new. Empty with ended = true once the cycle is over.' })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Vocab trainer not found' })
    public async getReviewQueue(@Param('id') id: string, @Query() query: FsrsReviewQueueQueryInput, @CurrentUser() user: User): Promise<FsrsReviewQueue> {
        return this.fsrsSessionService.getQueue(user.id, id, query);
    }

    @Get(':id/review-summary')
    @Throttle({ default: { limit: 60, ttl: 60000 } })
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER, UserRole.GUEST])
    @ApiOperation({ summary: 'Counts of an FSRS trainer: overdue, due today, new, mastered, leech' })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Vocab trainer not found' })
    public async getReviewSummary(@Param('id') id: string, @CurrentUser() user: User): Promise<FsrsReviewSummary> {
        return this.fsrsSessionService.getSummary(user.id, id);
    }

    @Post(':id/review-answer')
    @Throttle({ default: { limit: 120, ttl: 60000 } })
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER, UserRole.GUEST])
    @ApiOperation({ summary: 'Record the rating of one card. Sending the same answerId again does not schedule twice.' })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Card not found in this trainer' })
    @ApiResponse({ status: HttpStatus.CONFLICT, description: 'CycleEnded: the cycle of this trainer is over' })
    public async answerReview(@Param('id') id: string, @Body() input: FsrsReviewAnswerInput, @CurrentUser() user: User): Promise<FsrsReviewResult> {
        return this.fsrsSessionService.recordAnswer(user.id, id, input);
    }

    @Post(':id/review-check')
    @Throttle({ default: { limit: 120, ttl: 60000 } })
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER, UserRole.GUEST])
    @ApiOperation({ summary: 'Compare a typed answer with the accepted answers and suggest a rating. Nothing is recorded.' })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Card not found in this trainer' })
    public async checkReviewAnswer(@Param('id') id: string, @Body() input: FsrsReviewCheckInput, @CurrentUser() user: User): Promise<AnswerCheck> {
        return this.fsrsSessionService.checkAnswer(user.id, id, input);
    }

    @Delete(':id')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER, UserRole.GUEST])
    @ApiOperation({ summary: 'Delete vocab trainer' })
    @ApiResponse({ status: HttpStatus.OK, type: VocabTrainerDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Vocab trainer not found' })
    public async delete(@Param('id') id: string, @CurrentUser() user: User): Promise<VocabTrainerDto> {
        const trainer = await this.vocabTrainerService.delete(id, user.id);
        this.logger.info(`Deleted vocab trainer with ID ${id}`);
        return trainer;
    }

    @Post('bulk/delete')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER, UserRole.GUEST])
    @ApiOperation({ summary: 'Delete multiple vocab trainers' })
    @ApiResponse({ status: HttpStatus.OK, type: VocabTrainerDto })
    public async deleteBulk(@Body() body: VocabTrainerDeleteBulkInput, @CurrentUser() user: User): Promise<VocabTrainerDto[]> {
        return this.vocabTrainerService.deleteBulk(body.ids, user.id);
    }
}
