import { buildTranscriptionPrompt } from './transcription-prompt.util';

describe('buildTranscriptionPrompt', () => {
    it('names the spoken language in the prompt', () => {
        // Act & Assert
        expect(buildTranscriptionPrompt('vi')).toContain('Transcribe this vi audio recording');
    });

    it('asks for the transcript only and an empty reply when there is no speech', () => {
        // Act
        const prompt = buildTranscriptionPrompt('th');

        // Assert
        expect(prompt).toContain('Return only the transcript text');
        expect(prompt).toContain('If there is no speech, return an empty string');
    });
});
