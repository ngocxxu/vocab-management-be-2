import { QuestionType, TrainerMode, TrainerStatus, VocabTrainer } from '@prisma/client';
import { PASS_RULES } from '../utils/pass-rules.util';
import { VocabTrainerDto } from './vocab-trainer.dto';

describe('VocabTrainerDto', () => {
    test('exposes the fail streak that asks the reminder question, taken from PASS_RULES', () => {
        // Arrange
        const entity = {
            id: 'trainer-1',
            name: 'Week 1',
            status: TrainerStatus.PENDING,
            questionType: QuestionType.MULTIPLE_CHOICE,
            mode: TrainerMode.CLASSIC,
            questionAnswers: [],
        } as unknown as VocabTrainer;

        // Act
        const dto = new VocabTrainerDto(entity);

        // Assert
        expect(dto.reminderFailStreakForPrompt).toBe(PASS_RULES.failStreakForPrompt);
    });

    const baseEntity = {
        id: 'trainer-1',
        name: 'Week 1',
        status: TrainerStatus.PENDING,
        questionType: QuestionType.FILL_IN_THE_BLANK,
        mode: TrainerMode.CLASSIC,
        questionAnswers: [],
    };

    test('lists the time and grading state of the latest AI submit, and flags a failed grading (BE-3, BE-7)', () => {
        // Arrange
        const submittedAt = new Date('2026-11-23T10:00:00.000Z');
        const entity = { ...baseEntity, attempt: { submittedAt, gradingStatus: 'grading_failed', regradeCount: 1 } } as unknown as VocabTrainer;

        // Act
        const dto = new VocabTrainerDto(entity);

        // Assert
        expect(dto.lastSubmittedAt).toEqual(submittedAt);
        expect(dto.gradingStatus).toBe('grading_failed');
        expect(dto.regradeCount).toBe(1);
    });

    test('has no submit fields when the trainer was never AI-graded', () => {
        // Arrange
        const entity = { ...baseEntity, attempt: null } as unknown as VocabTrainer;

        // Act
        const dto = new VocabTrainerDto(entity);

        // Assert
        expect(dto.lastSubmittedAt).toBeNull();
        expect(dto.gradingStatus).toBeNull();
        expect(dto.regradeCount).toBe(0);
    });
});
