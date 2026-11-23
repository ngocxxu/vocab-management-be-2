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
});
