import { LoggerService, PaginationDto } from '@/shared';
import { getOrderBy, getPagination } from '@/shared/utils';
import type { AppLocale } from '@/shared/utils/locale.util';
import { Injectable } from '@nestjs/common';
import { Prisma, QuestionType, TrainerMode, TrainerStatus, User, VocabTrainer } from '@prisma/client';
import { AiConflictException } from '../../ai/exceptions';
import { AiService } from '../../ai/services/ai.service';
import { FsrsReminderService } from '../../reminder/services';
import { FsrsMapper } from '../../vocab/mappers/fsrs.mapper';
import { FsrsRepository } from '../../vocab/repositories/fsrs.repository';
import { VocabMasteryService } from '../../vocab/services/vocab-mastery.service';
import {
    CloneVocabTrainerInput,
    ExamJobStatusDto,
    ReminderPromptInput,
    SubmitExamBodyInput,
    SubmitFillInBlankChoiceInput,
    SubmitFillInBlankInput,
    SubmitMultipleChoiceInput,
    SubmitTranslationAudioInput,
    UpdateFsrsSettingsInput,
    UpdateVocabTrainerInput,
    VocabTrainerDto,
    VocabTrainerInput,
    VocabTrainerQueryParamsInput,
} from '../dto';
import { SubmitTranslationAudioResponseDto } from '../dto/submit-translation-audio-response.dto';
import { VocabTrainerBadRequestException, VocabTrainerNotFoundException, VocabTrainerWordNotFoundException } from '../exceptions';
import { VocabTrainerMapper } from '../mappers';
import { VocabTrainerRepository } from '../repositories';
import { buildVocabIdMap, EQuestionType, evaluateMultipleChoiceAnswers, VocabTrainerWithTypedAnswers, VocabWithTextTargets } from '../utils';
import { assertTrainerUpdateAllowed, assertValidTrainerCreate } from '../utils/fsrs-trainer-rules';
import { assertReminderSettings } from '../utils/pass-rules.util';
import { FsrsDefaultsService } from './fsrs-defaults.service';
import { VocabTrainerAttemptService } from './vocab-trainer-attempt.service';
import { VocabTrainerReminderService } from './vocab-trainer-reminder.service';

export interface FlipCardQuestion {
    frontText: string[];
    backText: string[];
    frontLanguageCode: string;
    backLanguageCode: string;
}

@Injectable()
export class VocabTrainerService {
    private readonly vocabTrainerMapper = new VocabTrainerMapper();
    private readonly fsrsMapper = new FsrsMapper();

    public constructor(
        private readonly vocabTrainerRepository: VocabTrainerRepository,
        private readonly aiService: AiService,
        private readonly vocabMasteryService: VocabMasteryService,
        private readonly logger: LoggerService,
        private readonly fsrsRepository: FsrsRepository,
        private readonly fsrsDefaultsService: FsrsDefaultsService,
        private readonly fsrsReminderService: FsrsReminderService,
        private readonly vocabTrainerAttempt: VocabTrainerAttemptService,
        private readonly vocabTrainerReminder: VocabTrainerReminderService,
    ) {}

    /**
     * Find all vocab trainers in the database (paginated)
     */
    public async find(query: VocabTrainerQueryParamsInput, userId?: string): Promise<PaginationDto<VocabTrainerDto>> {
        const { page, pageSize, skip, take } = getPagination({
            page: query.page,
            pageSize: query.pageSize,
            defaultPage: PaginationDto.DEFAULT_PAGE,
            defaultPageSize: PaginationDto.DEFAULT_PAGE_SIZE,
        });

        const orderBy = getOrderBy(query.sortBy, query.sortOrder, 'createdAt') as Prisma.VocabTrainerOrderByWithRelationInput;

        const { totalItems, trainers } = await this.vocabTrainerRepository.findWithPagination(query, userId, skip, take, orderBy);
        const items = this.vocabTrainerMapper.toResponseList(trainers);
        return this.vocabTrainerMapper.toPaginated(items, totalItems, page, pageSize);
    }

    /**
     * Find a single vocab trainer by ID
     */
    public async findOne(id: string, userId?: string): Promise<VocabTrainerDto> {
        const trainer = await this.vocabTrainerRepository.findById(id, userId);
        if (!trainer) {
            throw new VocabTrainerNotFoundException(id);
        }
        return this.vocabTrainerMapper.toResponse(trainer);
    }

    /**
     * Find a single vocab trainer by ID and exam
     */
    public async findOneAndExam(id: string, userId?: string): Promise<VocabTrainerDto> {
        const trainer = await this.vocabTrainerRepository.findByIdWithVocabs(id, userId);
        if (!trainer) {
            throw new VocabTrainerNotFoundException(id);
        }

        // -----------------------------Create multiple choice questions-------------------------------
        if (trainer.questionType === QuestionType.MULTIPLE_CHOICE) {
            const dataVocabAssignments: VocabWithTextTargets[] = (
                trainer as VocabTrainer & {
                    vocabAssignments: Array<{ vocab: VocabWithTextTargets }>;
                }
            ).vocabAssignments.map((vocabAssignment) => vocabAssignment.vocab);

            // Check if questions already exist
            const isQuestionAnswersExist = trainer.questionAnswers && Array.isArray(trainer.questionAnswers) && trainer.questionAnswers.length > 0;
            const shouldRegenerateQuestions = isQuestionAnswersExist && trainer.lastExamSubmittedAt !== null;

            if (shouldRegenerateQuestions) {
                await this.vocabTrainerRepository.updateVocabTrainerFields(trainer.id, {
                    questionAnswers: [],
                });

                trainer.questionAnswers = [];
            }

            if (!isQuestionAnswersExist || shouldRegenerateQuestions) {
                // Queue generation job
                const { jobId } = await this.aiService.queueMultipleChoiceGeneration({
                    vocabTrainerId: trainer.id,
                    vocabList: dataVocabAssignments,
                    userId: trainer.userId,
                    jobType: 'multiple-choice',
                    queueName: 'multiple-choice-generation',
                });

                trainer.questionAnswers = [];
                // Add jobId to trainer object for response
                (trainer as VocabTrainer & { jobId?: string }).jobId = jobId;
            }
        } else if (trainer.questionType === QuestionType.FILL_IN_BLANK_CHOICE) {
            const dataVocabAssignments: VocabWithTextTargets[] = (
                trainer as VocabTrainer & {
                    vocabAssignments: Array<{ vocab: VocabWithTextTargets }>;
                }
            ).vocabAssignments.map((vocabAssignment) => vocabAssignment.vocab);

            // Check if questions already exist
            const isQuestionAnswersExist = trainer.questionAnswers && Array.isArray(trainer.questionAnswers) && trainer.questionAnswers.length > 0;
            const shouldRegenerateQuestions = isQuestionAnswersExist && trainer.lastExamSubmittedAt !== null;

            if (shouldRegenerateQuestions) {
                await this.vocabTrainerRepository.updateVocabTrainerFields(trainer.id, {
                    questionAnswers: [],
                });

                trainer.questionAnswers = [];
            }

            if (!isQuestionAnswersExist || shouldRegenerateQuestions) {
                // Queue generation job
                const { jobId } = await this.aiService.queueFillInBlankChoiceGeneration({
                    vocabTrainerId: trainer.id,
                    vocabList: dataVocabAssignments,
                    userId: trainer.userId,
                    jobType: 'fill-in-blank-choice',
                    queueName: 'fill-in-blank-choice-generation',
                });

                trainer.questionAnswers = [];
                // Add jobId to trainer object for response
                (trainer as VocabTrainer & { jobId?: string }).jobId = jobId;
            }
        } else if (trainer.questionType === QuestionType.FILL_IN_THE_BLANK) {
            const fillInBlankQuestions: Array<{
                correctAnswer: string;
                type: 'textSource' | 'textTarget';
                content: string;
                vocabId: string;
            }> = [];

            (
                trainer as VocabTrainer & {
                    vocabAssignments: Array<{ vocab: VocabWithTextTargets }>;
                }
            ).vocabAssignments.forEach((assignment) => {
                const vocab = assignment.vocab;

                if (!vocab.textTargets || vocab.textTargets.length === 0) {
                    return;
                }

                const isAskingSource = Math.random() < 0.5;
                const randomTargetIndex = Math.floor(Math.random() * vocab.textTargets.length);
                const selectedTarget = vocab.textTargets[randomTargetIndex];

                if (isAskingSource) {
                    fillInBlankQuestions.push({
                        correctAnswer: selectedTarget.textTarget,
                        type: 'textSource',
                        content: `What is the translation of "${vocab.textSource}" in ${vocab.targetLanguageCode}?`,
                        vocabId: vocab.id,
                    });
                } else {
                    fillInBlankQuestions.push({
                        correctAnswer: vocab.textSource,
                        type: 'textTarget',
                        content: `What is the translation of "${selectedTarget.textTarget}" in ${vocab.sourceLanguageCode}?`,
                        vocabId: vocab.id,
                    });
                }
            });

            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            trainer.questionAnswers = JSON.parse(JSON.stringify(fillInBlankQuestions));
        } else if (trainer.questionType === QuestionType.FLIP_CARD) {
            const flipCardQuestions: FlipCardQuestion[] = [];

            (
                trainer as VocabTrainer & {
                    vocabAssignments: Array<{ vocab: VocabWithTextTargets }>;
                }
            ).vocabAssignments.forEach((assignment) => {
                const vocab = assignment.vocab;

                // Randomly decide direction for this vocab (true = source->target, false = target->source)
                const isSourceToTarget = Math.random() < 0.5;

                // Extract all textTargets as array
                const textTargetsArray = vocab.textTargets.map((tt) => tt.textTarget);

                // Create ONE card per vocab with all textTargets as arrays
                flipCardQuestions.push({
                    frontText: isSourceToTarget ? [vocab.textSource] : textTargetsArray,
                    backText: isSourceToTarget ? textTargetsArray : [vocab.textSource],
                    frontLanguageCode: isSourceToTarget ? vocab.sourceLanguageCode : vocab.targetLanguageCode,
                    backLanguageCode: isSourceToTarget ? vocab.targetLanguageCode : vocab.sourceLanguageCode,
                });
            });

            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            trainer.questionAnswers = JSON.parse(JSON.stringify(flipCardQuestions));
        } else if (trainer.questionType === QuestionType.TRANSLATION_AUDIO) {
            const trainerWithVocabs = trainer as VocabTrainer & {
                vocabAssignments: Array<{ vocab: VocabWithTextTargets }>;
            };
            if (trainerWithVocabs.vocabAssignments.length === 0) {
                trainer.questionAnswers = [];
            } else {
                const firstVocab = trainerWithVocabs.vocabAssignments[0].vocab;
                const targetLanguageCode = firstVocab.targetLanguageCode;
                const sourceLanguageCode = firstVocab.sourceLanguageCode;

                const targetLanguageWords: string[] = [];
                const sourceLanguageWords: string[] = [];
                trainerWithVocabs.vocabAssignments.forEach((assignment) => {
                    const vocab = assignment.vocab;
                    if (!sourceLanguageWords.includes(vocab.textSource)) {
                        sourceLanguageWords.push(vocab.textSource);
                    }
                    if (vocab.textTargets && vocab.textTargets.length > 0) {
                        vocab.textTargets.forEach((tt: { textTarget: string }) => {
                            if (!targetLanguageWords.includes(tt.textTarget)) {
                                targetLanguageWords.push(tt.textTarget);
                            }
                        });
                    }
                });

                if (targetLanguageWords.length > 0) {
                    const dialogueResult = await this.aiService.generateDialogueForVocabs(
                        targetLanguageWords,
                        sourceLanguageWords,
                        targetLanguageCode,
                        sourceLanguageCode,
                        trainer.userId,
                    );

                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    const dialogue: Array<{ speaker: string; text: string }> = JSON.parse(JSON.stringify(dialogueResult.dialogue));

                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    trainer.questionAnswers = dialogue;

                    await this.vocabTrainerRepository.update(trainer.id, {
                        questionAnswers: dialogue,
                    });
                } else {
                    trainer.questionAnswers = [];
                }
            }
        }

        const trainerDto = this.vocabTrainerMapper.toResponse(trainer);
        if ((trainer as VocabTrainer & { jobId?: string }).jobId) {
            trainerDto.jobId = (trainer as VocabTrainer & { jobId?: string }).jobId;
        }
        return trainerDto;
    }

    public async submitMultipleChoice(id: string, input: SubmitMultipleChoiceInput, user: User): Promise<VocabTrainerDto> {
        return this.submitChoiceBasedExam(id, input, user, EQuestionType.MULTIPLE_CHOICE);
    }

    public async submitFillInBlankChoice(id: string, input: SubmitFillInBlankChoiceInput, user: User): Promise<VocabTrainerDto> {
        return this.submitChoiceBasedExam(id, input, user, EQuestionType.FILL_IN_BLANK_CHOICE);
    }

    public async getExamJobStatus(userId: string, vocabTrainerId: string, jobId: string): Promise<ExamJobStatusDto> {
        return this.aiService.getExamJobStatus(userId, vocabTrainerId, jobId);
    }

    public async submitFillInBlank(id: string, input: SubmitFillInBlankInput, user: User, locale?: AppLocale): Promise<VocabTrainerDto> {
        const trainer = await this.vocabTrainerRepository.findByIdWithVocabsAndResults(id, user.id);

        if (!trainer) {
            throw new VocabTrainerNotFoundException(id);
        }
        this.assertClassicTrainer(trainer);

        const { countTime, wordTestInputs } = input;
        if (!wordTestInputs?.length) {
            throw new VocabTrainerBadRequestException('wordTestInputs is required for fill in the blank');
        }

        const trainerWithVocabs = trainer as VocabTrainer & {
            vocabAssignments: Array<{ vocab: VocabWithTextTargets }>;
        };

        const evaluationsToProcess: Array<{
            answerSubmission: (typeof wordTestInputs)[number];
            vocab: VocabWithTextTargets;
            answerType: 'textSource' | 'textTarget';
        }> = [];

        for (const answerSubmission of wordTestInputs) {
            let matchedVocabAssignment = null;
            let answerType: 'textSource' | 'textTarget' = 'textTarget';

            for (const vocabAssignment of trainerWithVocabs.vocabAssignments) {
                const vocabItem = vocabAssignment.vocab;

                if (vocabItem.textSource === answerSubmission.systemAnswer) {
                    matchedVocabAssignment = vocabAssignment;
                    answerType = 'textTarget';
                    break;
                }

                if (vocabItem.textTargets && vocabItem.textTargets.length > 0) {
                    const matchingTextTarget = vocabItem.textTargets.find((textTarget: { textTarget: string }) => textTarget.textTarget === answerSubmission.systemAnswer);
                    if (matchingTextTarget) {
                        matchedVocabAssignment = vocabAssignment;
                        answerType = 'textSource';
                        break;
                    }
                }
            }

            if (!matchedVocabAssignment) {
                this.logger.warn(`Could not find vocab for systemAnswer "${answerSubmission.systemAnswer}"`);
                continue;
            }

            evaluationsToProcess.push({
                answerSubmission,
                vocab: matchedVocabAssignment.vocab,
                answerType,
            });
        }

        if (evaluationsToProcess.length > 0) {
            const { jobId } = await this.aiService.queueFillInBlankEvaluation({
                locale,
                vocabTrainerId: trainer.id,
                // Runs under the user's job lock, and only when this submit starts the job (#42, D-ai).
                decideAttempt: async () => ({
                    countsAsAttempt: await this.vocabTrainerAttempt.resolveCountsAsAttempt(trainer.id),
                    submittedAt: new Date().toISOString(),
                }),
                evaluations: evaluationsToProcess.map((item) => ({
                    vocab: item.vocab,
                    userAnswer: item.answerSubmission.userAnswer,
                    systemAnswer: item.answerSubmission.systemAnswer,
                    questionType: item.answerType,
                    vocabId: item.vocab.id,
                })),
                answerSubmissions: wordTestInputs,
                userId: user.id,
                jobType: 'fill-in-blank',
                queueName: 'fill-in-blank-evaluation',
            });

            (trainer as VocabTrainer & { jobId?: string }).jobId = jobId;
        }

        await this.vocabTrainerRepository.update(trainer.id, {
            countTime,
            setCountTime: trainer.setCountTime,
            updatedAt: new Date(),
        });

        return this.vocabTrainerMapper.toResponse(trainer as unknown as ConstructorParameters<typeof VocabTrainerDto>[0]);
    }

    public async submitTranslationAudio(id: string, input: SubmitTranslationAudioInput, user: User, locale?: AppLocale): Promise<SubmitTranslationAudioResponseDto> {
        const trainer = await this.vocabTrainerRepository.findByIdWithVocabsAndResults(id, user.id);

        if (!trainer) {
            throw new VocabTrainerNotFoundException(id);
        }

        if (trainer.questionType !== QuestionType.TRANSLATION_AUDIO) {
            throw new VocabTrainerBadRequestException('Question type is not TRANSLATION_AUDIO');
        }

        const { fileId, targetStyle, targetAudience, countTime } = input;
        if (!fileId) {
            throw new VocabTrainerBadRequestException('fileId is required for translation audio');
        }

        if (fileId) {
            try {
                await this.aiService.downloadAudioFromCloudinary(fileId);
            } catch (error) {
                this.logger.error(`Failed to download audio from Cloudinary: ${error}`);
                throw new VocabTrainerBadRequestException(`Invalid fileId: ${error instanceof Error ? error.message : String(error)}`);
            }
        }

        if (!trainer.questionAnswers || !Array.isArray(trainer.questionAnswers)) {
            throw new VocabTrainerBadRequestException('Dialogue not found in questionAnswers');
        }

        const targetDialogue = trainer.questionAnswers as Array<{
            speaker: string;
            text: string;
        }>;

        if (targetDialogue.length === 0) {
            throw new VocabTrainerBadRequestException('Dialogue is empty');
        }

        const trainerWithVocabs = trainer as unknown as VocabTrainer & {
            vocabAssignments: Array<{ vocab: VocabWithTextTargets }>;
        };
        const firstVocab = trainerWithVocabs.vocabAssignments[0]?.vocab;
        if (!firstVocab) {
            throw new VocabTrainerBadRequestException('No vocab assignments found');
        }

        const sourceLanguageCode = firstVocab.sourceLanguageCode;
        const targetLanguageCode = firstVocab.targetLanguageCode;

        const sourceWords: string[] = [];
        trainerWithVocabs.vocabAssignments.forEach((assignment) => {
            const vocab = assignment.vocab;
            if (!sourceWords.includes(vocab.textSource)) {
                sourceWords.push(vocab.textSource);
            }
        });

        const { jobId } = await this.aiService.queueAudioEvaluation({
            locale,
            fileId,
            targetDialogue,
            sourceLanguageCode,
            targetLanguageCode,
            sourceWords,
            targetStyle,
            targetAudience,
            userId: user.id,
            vocabTrainerId: trainer.id,
            jobType: 'audio',
            queueName: 'audio-evaluation',
        });

        await this.vocabTrainerRepository.update(trainer.id, {
            countTime,
            updatedAt: new Date(),
        });

        const result = await this.vocabTrainerRepository.findById(trainer.id);

        if (!result) {
            throw new VocabTrainerNotFoundException(id);
        }

        return {
            trainer: this.vocabTrainerMapper.toResponse(result as unknown as ConstructorParameters<typeof VocabTrainerDto>[0]),
            jobId,
        };
    }

    /**
     * Create a new vocab trainer
     */
    public async create(input: VocabTrainerInput, userId: string): Promise<VocabTrainerDto> {
        assertValidTrainerCreate(input);
        assertReminderSettings(input, { mode: input.mode ?? TrainerMode.CLASSIC });
        if (input.mode === TrainerMode.FSRS) {
            return this.createFsrsTrainer(input, userId);
        }

        const trainer = await this.vocabTrainerRepository.create(this.vocabTrainerMapper.toCreateInput(input, userId));

        const trainerWithAssignments = await this.vocabTrainerRepository.findById(trainer.id);

        if (!trainerWithAssignments) {
            throw new VocabTrainerNotFoundException(trainer.id);
        }

        return this.vocabTrainerMapper.toResponse(trainerWithAssignments as unknown as ConstructorParameters<typeof VocabTrainerDto>[0]);
    }

    /**
     * Update a vocab trainer. Status, Passes and the last-remind time are ignored: only an exam changes them (#42).
     * `reminderDisabled` goes through the same toggle as the prompt, so turning reminders off cancels the pending ones.
     */
    public async update(id: string, input: UpdateVocabTrainerInput, userId?: string): Promise<VocabTrainerDto> {
        const existing = await this.vocabTrainerRepository.findById(id, userId);
        if (!existing) {
            throw new VocabTrainerNotFoundException(id);
        }

        assertTrainerUpdateAllowed(input, existing);
        assertReminderSettings(input, existing);

        const { vocabAssignmentIds, reminderDisabled, ...trainerData } = input;
        const remindersToggled = reminderDisabled !== undefined && reminderDisabled !== existing.reminderDisabled;

        let skippedVocabIds: string[] | undefined;
        if (vocabAssignmentIds !== undefined) {
            const uniqueVocabIds = [...new Set(vocabAssignmentIds)];

            await this.vocabTrainerRepository.inTransaction(async (tx) => {
                const trainerWithAssignments = await this.vocabTrainerRepository.replaceVocabTrainerWordAssignments(
                    tx,
                    id,
                    this.vocabTrainerMapper.toScalarPatch(trainerData, existing),
                    existing,
                    uniqueVocabIds,
                );

                if (!trainerWithAssignments) {
                    throw new VocabTrainerNotFoundException(id);
                }

                if (existing.mode === TrainerMode.FSRS) {
                    skippedVocabIds = await this.enrollFsrsCards(tx, trainerWithAssignments, uniqueVocabIds);
                }
            });
        } else {
            await this.vocabTrainerRepository.update(id, this.vocabTrainerMapper.buildUpdateInput(trainerData, existing));
        }

        if (remindersToggled) {
            await this.vocabTrainerReminder.setRemindersEnabled(id, existing.userId, !reminderDisabled);
        }
        await this.syncFsrsReminder(existing);

        const trainer = await this.vocabTrainerRepository.findById(id, userId);
        if (!trainer) {
            throw new VocabTrainerNotFoundException(id);
        }

        const dto = this.vocabTrainerMapper.toResponse(trainer as unknown as ConstructorParameters<typeof VocabTrainerDto>[0]);
        if (skippedVocabIds !== undefined) {
            dto.fsrsSkippedVocabIds = skippedVocabIds;
        }

        return dto;
    }

    /** Yes/No answer to the reminder prompt of a Classic trainer. Yes keeps reminders on; No turns them off. */
    public async answerReminderPrompt(id: string, input: ReminderPromptInput, userId: string): Promise<VocabTrainerDto> {
        await this.vocabTrainerReminder.answerReminderPrompt(id, userId, input.continueReminders);

        const trainer = await this.vocabTrainerRepository.findById(id, userId);
        if (!trainer) {
            throw new VocabTrainerNotFoundException(id);
        }

        return this.vocabTrainerMapper.toResponse(trainer as unknown as ConstructorParameters<typeof VocabTrainerDto>[0]);
    }

    /** Changes the settings of an FSRS trainer that stay editable. Mode and directions are fixed at creation. */
    public async updateFsrsSettings(id: string, input: UpdateFsrsSettingsInput, userId?: string): Promise<VocabTrainerDto> {
        const existing = await this.vocabTrainerRepository.findById(id, userId);
        if (!existing) {
            throw new VocabTrainerNotFoundException(id);
        }
        if (existing.mode !== TrainerMode.FSRS) {
            throw new VocabTrainerBadRequestException('FSRS settings need mode FSRS');
        }
        if (input.mode !== undefined || input.directions !== undefined) {
            throw new VocabTrainerBadRequestException('The mode and the directions of a trainer cannot be changed');
        }
        if (input.endsAt && input.endsAt.getTime() <= Date.now()) {
            throw new VocabTrainerBadRequestException('The end of the cycle must be in the future');
        }

        const { desiredRetention, maximumInterval, newPerDay, endsAt } = input;
        const trainer = await this.vocabTrainerRepository.update(id, this.fsrsMapper.toColumns({ desiredRetention, maximumInterval, newPerDay, endsAt }));
        // A longer deadline brings the reminders back; a shorter one can bring the next one forward.
        await this.syncFsrsReminder(existing);

        return this.vocabTrainerMapper.toResponse(trainer);
    }

    /**
     * Starts a new cycle from an FSRS trainer: a new trainer with the same words, directions and settings, a new name and an
     * optional new deadline. Its cards start as NEW; the original trainer, its cards and its logs are not touched.
     */
    public async clone(id: string, input: CloneVocabTrainerInput, userId: string): Promise<VocabTrainerDto> {
        const source = (await this.vocabTrainerRepository.findById(id, userId)) as (VocabTrainer & { vocabAssignments: Array<{ vocabId: string }> }) | null;
        if (!source) {
            throw new VocabTrainerNotFoundException(id);
        }
        if (source.mode !== TrainerMode.FSRS) {
            throw new VocabTrainerBadRequestException('Only an FSRS trainer can start a new cycle');
        }
        if (input.endsAt && input.endsAt.getTime() <= Date.now()) {
            throw new VocabTrainerBadRequestException('The end of the cycle must be in the future');
        }

        const settings = this.fsrsMapper.toSettings(source);

        return this.persistFsrsTrainer(
            {
                name: input.name,
                status: TrainerStatus.PENDING,
                questionType: source.questionType,
                setCountTime: source.setCountTime,
                reminderDisabled: source.reminderDisabled,
                vocabAssignmentIds: source.vocabAssignments.map((assignment) => assignment.vocabId),
                mode: TrainerMode.FSRS,
                fsrsDesiredRetention: settings.desiredRetention,
                fsrsMaximumInterval: settings.maximumInterval,
                fsrsNewPerDay: settings.newPerDay,
                fsrsDirections: settings.directions,
                fsrsEndsAt: input.endsAt ?? null,
            },
            userId,
        );
    }

    /**
     * Removes one word from a trainer (the vocab itself stays). The FSRS cards of the word are deleted, its review logs are kept.
     * 404 when the trainer is not the user's or the word is not in it.
     */
    public async removeVocab(trainerId: string, vocabId: string, userId: string): Promise<VocabTrainerDto> {
        const existing = await this.vocabTrainerRepository.findById(trainerId, userId);
        if (!existing) {
            throw new VocabTrainerNotFoundException(trainerId);
        }

        const removed = await this.vocabTrainerRepository.inTransaction(async (tx) => this.vocabTrainerRepository.deleteTrainerWord(tx, trainerId, vocabId));
        if (removed === 0) {
            throw new VocabTrainerWordNotFoundException(trainerId, vocabId);
        }

        await this.syncFsrsReminder(existing);
        const trainer = await this.vocabTrainerRepository.findByIdWithVocabs(trainerId, userId);

        return this.vocabTrainerMapper.toResponse(trainer as unknown as ConstructorParameters<typeof VocabTrainerDto>[0]);
    }

    /**
     * Delete a vocab trainer. Its open reminders are cancelled and its bells hidden, so no reminder goes out for it.
     */
    public async delete(id: string, userId?: string): Promise<VocabTrainerDto> {
        const trainer = await this.vocabTrainerRepository.delete(id, userId);
        await this.vocabTrainerReminder.onTrainerRemoved(trainer.id, trainer.userId);

        return this.vocabTrainerMapper.toResponse(trainer);
    }

    public async deleteBulk(ids: string[], userId?: string): Promise<VocabTrainerDto[]> {
        return Promise.all(ids.map(async (id) => this.delete(id, userId)));
    }

    /**
     * Shared submit flow for choice-based exams (multiple choice + fill-in-blank choice):
     * both use ABCD single-answer scoring via evaluateMultipleChoiceAnswers.
     */
    private async submitChoiceBasedExam(id: string, input: SubmitExamBodyInput, user: User, examQuestionType: EQuestionType): Promise<VocabTrainerDto> {
        const trainer = (await this.vocabTrainerRepository.findByIdWithVocabsAndResults(id, user.id)) as unknown as VocabTrainerWithTypedAnswers & {
            vocabAssignments?: Array<{
                vocab: VocabWithTextTargets;
            }>;
        };
        if (!trainer) {
            throw new VocabTrainerNotFoundException(id);
        }
        this.assertClassicTrainer(trainer);

        const { countTime, wordTestSelects } = input;
        if (!wordTestSelects?.length) {
            throw new VocabTrainerBadRequestException('wordTestSelects is required for choice-based exam');
        }

        const vocabIdMap = buildVocabIdMap(trainer.questionAnswers, trainer.vocabAssignments);

        // Use the utility function for answer evaluation
        const { createResults, correctAnswers } = evaluateMultipleChoiceAnswers(trainer.id, wordTestSelects, vocabIdMap);

        const totalQuestions = wordTestSelects.length;
        const scorePercentage = (correctAnswers / totalQuestions) * 100;
        const overallStatus = scorePercentage >= 70 ? TrainerStatus.PASSED : TrainerStatus.FAILED;
        const examUrl = `${process.env.FRONTEND_URL}/${trainer.id}/exam/${examQuestionType}`;

        // An AI job of this trainer that is still running owns the attempt, so this submit waits for it (#42, D-mc).
        const activeAiJob = await this.aiService.getActiveJobForTrainer(user.id, trainer.id);
        if (activeAiJob) {
            throw new AiConflictException('An AI job for this trainer is still running. Please wait for it to finish and try again.');
        }

        const submittedAt = new Date();
        // Count, results and the Pass run in one transaction on the locked trainer row. Two parallel submits count once.
        const applied = await this.vocabTrainerRepository.inTransaction(async (tx) => {
            const locked = await this.vocabTrainerRepository.lockAndFindForUpdate(tx, trainer.id);
            if (!locked) {
                throw new VocabTrainerNotFoundException(id);
            }

            const counts = await this.vocabTrainerAttempt.resolveCountsAsAttempt(trainer.id, tx, submittedAt);
            await this.vocabTrainerRepository.deleteVocabTrainerResults(trainer.id, tx);
            await this.vocabTrainerRepository.createVocabTrainerResultsMany(createResults, tx);

            return this.vocabTrainerAttempt.applyAttemptTx(tx, { trainer: locked, user, overallStatus, counts, submittedAt, countTime, examUrl });
        });

        // After the commit, and best effort: a failure here never fails the submit.
        await this.recordMasteryAfterCommit(createResults, user.id);
        await this.vocabTrainerAttempt.afterCommit(applied);

        const snapshot = applied.completed ? { ...trainer, status: applied.trainer.status, reminderRepeat: applied.trainer.reminderRepeat } : applied.trainer;

        return this.vocabTrainerMapper.toResponse(snapshot as unknown as ConstructorParameters<typeof VocabTrainerDto>[0]);
    }

    private async recordMasteryAfterCommit(results: Prisma.VocabTrainerResultCreateManyInput[], userId: string): Promise<void> {
        for (const result of results) {
            if (!result.vocabId) {
                continue;
            }
            try {
                await this.vocabMasteryService.updateMastery(result.vocabId, userId, result.status === TrainerStatus.PASSED);
            } catch (error: unknown) {
                this.logger.error(`Mastery update failed after exam for vocab ${result.vocabId}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }

    /** The trainer and its cards are created together, so an FSRS trainer never exists without the cards of its words. */
    private async createFsrsTrainer(input: VocabTrainerInput, userId: string): Promise<VocabTrainerDto> {
        // The trainer keeps its own copy of the defaults of the user, so changing them later does not touch it.
        const inputWithDefaults = { ...input, ...(await this.fsrsDefaultsService.resolveForCreate(userId, input)) };

        return this.persistFsrsTrainer(inputWithDefaults, userId);
    }

    /** Writes a trainer whose settings are complete, with the cards of its words, in one transaction. */
    private async persistFsrsTrainer(input: VocabTrainerInput, userId: string): Promise<VocabTrainerDto> {
        const created = await this.vocabTrainerRepository.inTransaction(async (tx) => {
            const trainer = await this.vocabTrainerRepository.create(this.vocabTrainerMapper.toCreateInput(input, userId), tx);
            const trainerDto = this.vocabTrainerMapper.toResponse(trainer);
            trainerDto.fsrsSkippedVocabIds = await this.enrollFsrsCards(tx, trainer, input.vocabAssignmentIds ?? []);

            return trainerDto;
        });
        await this.fsrsReminderService.sync(userId, created.id);

        return created;
    }

    /** The reminder of an FSRS trainer follows its cards and settings; Classic reminders are planned after an exam instead. */
    private async syncFsrsReminder(trainer: Pick<VocabTrainer, 'id' | 'userId' | 'mode'>): Promise<void> {
        if (trainer.mode === TrainerMode.FSRS) {
            await this.fsrsReminderService.sync(trainer.userId, trainer.id);
        }
    }

    /**
     * Creates the missing cards (one per word and direction) and returns the words that cannot have one yet because
     * they have no translation. Cards that already exist are left alone, so this is safe to run on every update.
     */
    private async enrollFsrsCards(tx: Prisma.TransactionClient, trainer: VocabTrainer, vocabIds: string[]): Promise<string[]> {
        const uniqueVocabIds = [...new Set(vocabIds)];
        const enrollable = new Set(await this.fsrsRepository.findVocabIdsWithTranslation(tx, uniqueVocabIds));
        const cards = [...enrollable].flatMap((vocabId) => trainer.fsrsDirections.map((direction) => ({ vocabTrainerId: trainer.id, vocabId, userId: trainer.userId, direction })));

        if (cards.length > 0) {
            await this.fsrsRepository.createCards(tx, cards);
        }

        return uniqueVocabIds.filter((vocabId) => !enrollable.has(vocabId));
    }

    /** FSRS trainers are reviewed card by card through the review API; the exam flow would delete or re-status them like a Classic trainer. */
    private assertClassicTrainer(trainer: Pick<VocabTrainer, 'mode'>): void {
        if (trainer.mode === TrainerMode.FSRS) {
            throw new VocabTrainerBadRequestException('An FSRS trainer is reviewed through the FSRS review API, not submitted as an exam');
        }
    }
}
