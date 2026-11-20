import { MailProvider } from '../providers';
import { EmailService } from './email.service';

const examPayload = { firstName: 'Ann', testName: 'Exam words', examUrl: 'https://app.example/exam' };

function createService() {
    const sendMail = jest.fn().mockResolvedValue(undefined);
    const service = new EmailService({ sendMail } as unknown as MailProvider);

    return { service, sendMail };
}

describe('EmailService.sendReminderEmail', () => {
    it('passes the idempotency key on to the mail provider', async () => {
        // Arrange
        const { service, sendMail } = createService();

        // Act
        await service.sendReminderEmail('learner@example.com', 'Vocab Trainer', 'exam_reminder', examPayload, 'schedule-1');

        // Assert
        expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'learner@example.com', idempotencyKey: 'schedule-1' }));
    });

    it('sends no idempotency key when none is given', async () => {
        // Arrange
        const { service, sendMail } = createService();

        // Act
        await service.sendReminderEmail('learner@example.com', 'Vocab Trainer', 'exam_reminder', examPayload);

        // Assert
        const [input] = sendMail.mock.calls[0] as [Record<string, unknown>];
        expect(input.idempotencyKey).toBeUndefined();
    });
});
