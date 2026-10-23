import { ExamJobSnapshot, toExamJobStatus } from './exam-job-status.util';

describe('toExamJobStatus', () => {
    const snapshot = (overrides: Partial<ExamJobSnapshot>): ExamJobSnapshot => ({ jobId: 'j1', queueName: 'fill-in-blank-evaluation', state: 'active', ...overrides });

    test('reports unknown when the job does not exist', () => {
        expect(toExamJobStatus(undefined, 'j1')).toMatchObject({ jobId: 'j1', status: 'unknown' });
    });

    test('reports unknown for an explicit unknown state', () => {
        expect(toExamJobStatus(snapshot({ state: 'unknown' }), 'j1').status).toBe('unknown');
    });

    test('returns the stored result as data when completed', () => {
        // Act
        const dto = toExamJobStatus(snapshot({ state: 'completed', returnvalue: { results: [{ status: 'PASSED' }] } }), 'j1');

        // Assert
        expect(dto).toMatchObject({ status: 'completed', data: { results: [{ status: 'PASSED' }] } });
    });

    test('omits data when a completed job stored no object', () => {
        expect(toExamJobStatus(snapshot({ state: 'completed', returnvalue: undefined }), 'j1').data).toBeUndefined();
    });

    test('returns the failure reason when failed', () => {
        expect(toExamJobStatus(snapshot({ state: 'failed', failedReason: 'AI timed out' }), 'j1')).toMatchObject({ status: 'failed', error: 'AI timed out' });
    });

    test.each(['waiting', 'active', 'delayed', 'paused', 'stuck'] as const)('keeps a %s evaluation job in the evaluating state', (state) => {
        expect(toExamJobStatus(snapshot({ state }), 'j1').status).toBe('evaluating');
    });

    test('uses the generating state for generation queues', () => {
        expect(toExamJobStatus(snapshot({ state: 'active', queueName: 'multiple-choice-generation' }), 'j1').status).toBe('generating');
    });
});
