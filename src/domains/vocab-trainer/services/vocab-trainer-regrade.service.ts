import { Injectable } from '@nestjs/common';
import { TrainerMode, User, UserRole } from '@prisma/client';
import { AiService } from '../../ai/services/ai.service';
import { VocabTrainerDto } from '../dto';
import { VocabTrainerBadRequestException, VocabTrainerConflictException, VocabTrainerNotFoundException } from '../exceptions';
import { VocabTrainerMapper } from '../mappers';
import { VocabTrainerRepository } from '../repositories';
import { ATTEMPT_KIND, GRADING_STATUS, REGRADE_LIMIT, toRegradePayload } from '../utils';

/**
 * Regrades the latest AI-graded submit when its grading failed (#17). The stored answers are graded again, so the user does not
 * answer again. Owner only, at most REGRADE_LIMIT times per submit. A regrade keeps the counting decision of its submit: it never
 * checks the trainer again, and audio never counts a Pass.
 */
@Injectable()
export class VocabTrainerRegradeService {
    private readonly vocabTrainerMapper = new VocabTrainerMapper();

    public constructor(
        private readonly vocabTrainerRepository: VocabTrainerRepository,
        private readonly aiService: AiService,
    ) {}

    public async regrade(id: string, user: User): Promise<VocabTrainerDto> {
        const trainer = await this.vocabTrainerRepository.findById(id, user.id);
        if (!trainer) {
            throw new VocabTrainerNotFoundException(id);
        }
        if (trainer.mode === TrainerMode.FSRS) {
            throw new VocabTrainerBadRequestException('An FSRS trainer is reviewed through the FSRS review API, not submitted as an exam');
        }

        // These checks are early answers only. The claim under the job lock is the one that counts.
        const attempt = await this.vocabTrainerRepository.findAttemptByTrainerId(id, user.id);
        if (!attempt) {
            throw new VocabTrainerConflictException('This trainer has no AI-graded submit to regrade');
        }
        if (attempt.kind === ATTEMPT_KIND.AUDIO && user.role === UserRole.GUEST) {
            throw new VocabTrainerBadRequestException('Question type is not suitable');
        }
        if (attempt.gradingStatus !== GRADING_STATUS.GRADING_FAILED) {
            throw new VocabTrainerConflictException('Only a submit whose grading failed can be regraded');
        }
        if (attempt.regradeCount >= REGRADE_LIMIT) {
            throw new VocabTrainerConflictException('This submit has no regrade left');
        }

        const isAudio = attempt.kind === ATTEMPT_KIND.AUDIO;
        const { jobId } = await this.aiService.queueRegrade({
            userId: user.id,
            vocabTrainerId: id,
            jobType: isAudio ? 'audio' : 'fill-in-blank',
            queueName: isAudio ? 'audio-evaluation' : 'fill-in-blank-evaluation',
            claim: async () => {
                const claimed = await this.vocabTrainerRepository.claimAttemptRegrade(id, user.id);
                if (!claimed) {
                    throw new VocabTrainerConflictException('This submit cannot be regraded now');
                }

                return { payload: toRegradePayload(claimed.attempt), rollback: claimed.rollback };
            },
        });

        const refreshed = await this.vocabTrainerRepository.findById(id, user.id);
        if (!refreshed) {
            throw new VocabTrainerNotFoundException(id);
        }
        const dto = this.vocabTrainerMapper.toResponse(refreshed as unknown as ConstructorParameters<typeof VocabTrainerDto>[0]);
        dto.jobId = jobId;

        return dto;
    }
}
