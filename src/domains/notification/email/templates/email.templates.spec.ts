import { EEmailTemplate } from '../../../reminder/utils';
import { EmailTemplates } from './email.templates';

describe('FSRS due reminder template', () => {
    const data = {
        firstName: 'Ada',
        lastName: 'Lovelace',
        trainerName: 'Exam words',
        reviewCount: 12,
        newCount: 5,
        reviewUrl: 'https://app.example/vocab-trainer/t1/review',
    };

    test('is registered under its own name', () => {
        // Act
        const html = EmailTemplates.render(EEmailTemplate.FSRS_DUE_REMINDER, data);

        // Assert
        expect(html).toContain('Time to review');
    });

    test('shows both numbers, the trainer, the name and a link to the review page', () => {
        // Act
        const html = EmailTemplates.render(EEmailTemplate.FSRS_DUE_REMINDER, data);

        // Assert
        expect(html).toContain('<strong>12</strong> questions to review');
        expect(html).toContain('<strong>5</strong> new questions ready');
        expect(html).toContain('Exam words');
        expect(html).toContain('Ada Lovelace');
        expect(html).toContain('href="https://app.example/vocab-trainer/t1/review"');
    });

    test('uses the singular for one question', () => {
        // Act
        const html = EmailTemplates.render(EEmailTemplate.FSRS_DUE_REMINDER, { ...data, reviewCount: 1, newCount: 1 });

        // Assert
        expect(html).toContain('<strong>1</strong> question to review');
        expect(html).toContain('<strong>1</strong> new question ready');
    });

    test('leaves out a line whose number is zero', () => {
        // Act
        const onlyNew = EmailTemplates.render(EEmailTemplate.FSRS_DUE_REMINDER, { ...data, reviewCount: 0 });
        const onlyReview = EmailTemplates.render(EEmailTemplate.FSRS_DUE_REMINDER, { ...data, newCount: 0 });

        // Assert
        expect(onlyNew).not.toMatch(/questions? to review/);
        expect(onlyNew).toContain('new questions ready');
        expect(onlyReview).not.toMatch(/new questions? ready/);
        expect(onlyReview).toContain('questions to review');
    });
});
