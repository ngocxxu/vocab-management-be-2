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

describe('HTML escaping and link checks', () => {
    const examData = {
        firstName: 'Ada',
        lastName: 'Lovelace',
        testName: 'Test 1',
        repeatDays: '1',
        examUrl: 'https://app.example/exam',
    };

    test('escapes names and text so they cannot add markup', () => {
        // Arrange
        const data = { ...examData, firstName: '<img src=x onerror=alert(1)>', testName: 'Test "1"' };

        // Act
        const html = EmailTemplates.render(EEmailTemplate.EXAM_REMINDER, data);

        // Assert
        expect(html).not.toContain('<img src=x');
        expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
        expect(html).toContain('Test &quot;1&quot;');
    });

    test('shows reminder text as text, not markup', () => {
        // Act
        const html = EmailTemplates.render(EEmailTemplate.REMINDER, { userName: 'Ada', content: '<b>Hi</b>' });

        // Assert
        expect(html).not.toContain('<b>Hi</b>');
        expect(html).toContain('&lt;b&gt;Hi&lt;/b&gt;');
    });

    test('leaves out the button when the link is not http or https', () => {
        // Act
        const html = EmailTemplates.render(EEmailTemplate.EXAM_REMINDER, { ...examData, examUrl: 'javascript:alert(1)' });

        // Assert
        expect(html).not.toContain('javascript:');
        expect(html).not.toContain('Complete test now');
    });

    test('keeps an https link and escapes its ampersands', () => {
        // Act
        const html = EmailTemplates.render(EEmailTemplate.WELCOME, { userName: 'Ada', loginUrl: 'https://app.example/login?a=1&b=2' });

        // Assert
        expect(html).toContain('href="https://app.example/login?a=1&amp;b=2"');
    });
});

describe('Exam reminder template', () => {
    test('says when the next reminder comes, counted from the attempt', () => {
        // Arrange
        const data = { firstName: 'Ada', lastName: 'Lovelace', testName: 'Exam words', repeatDays: '5', examUrl: 'https://app.example/t1/exam' };

        // Act
        const html = EmailTemplates.render(EEmailTemplate.EXAM_REMINDER, data);

        // Assert: the text a reader sees, without the markup
        const visibleText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
        expect(visibleText).toContain('Next reminder: in 5 days after your attempt.');
        expect(visibleText).not.toContain('Repeat schedule');
    });
});
