import { Resend } from 'resend';
import { MailProvider } from './mail.provider';

jest.mock('resend', () => ({ Resend: jest.fn() }));

const input = { from: 'Vocab Management <support@example.com>', to: 'learner@example.com', subject: '[Reminder]: Vocab Trainer', html: '<p>Hi</p>' };

function mockResendSend(response: unknown): jest.Mock {
    const send = jest.fn().mockResolvedValue(response);
    (Resend as unknown as jest.Mock).mockImplementation(() => ({ emails: { send } }));

    return send;
}

describe('MailProvider.sendMail', () => {
    it('keeps the Resend error name and status code on the thrown error', async () => {
        // Arrange
        mockResendSend({ data: null, error: { name: 'validation_error', message: 'Invalid from address', statusCode: 422 } });
        const provider = new MailProvider();

        // Act and Assert
        await expect(provider.sendMail(input)).rejects.toMatchObject({ name: 'validation_error', statusCode: 422, message: 'Invalid from address' });
    });

    it('keeps a missing status code as null', async () => {
        // Arrange
        mockResendSend({ data: null, error: { name: 'application_error', message: 'Network down', statusCode: null } });
        const provider = new MailProvider();

        // Act and Assert
        await expect(provider.sendMail(input)).rejects.toMatchObject({ name: 'application_error', statusCode: null });
    });

    it('resolves when Resend accepts the email', async () => {
        // Arrange
        mockResendSend({ data: { id: 'msg_1' }, error: null });
        const provider = new MailProvider();

        // Act and Assert
        await expect(provider.sendMail(input)).resolves.toBeUndefined();
    });

    it('sends with the idempotency key as request options when one is given', async () => {
        // Arrange
        const send = mockResendSend({ data: { id: 'msg_1' }, error: null });
        const provider = new MailProvider();

        // Act
        await provider.sendMail({ ...input, idempotencyKey: 'schedule-1' });

        // Assert
        expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: ['learner@example.com'] }), { idempotencyKey: 'schedule-1' });
    });

    it('sends with no request options when no key is given', async () => {
        // Arrange
        const send = mockResendSend({ data: { id: 'msg_1' }, error: null });
        const provider = new MailProvider();

        // Act
        await provider.sendMail(input);

        // Assert
        expect(send.mock.calls[0]).toHaveLength(1);
    });
});
