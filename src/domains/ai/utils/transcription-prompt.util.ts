/**
 * Shared prompt for audio transcription. Used by every provider that transcribes through a chat model.
 * The "empty string" rule stops models from inventing text for silent or noisy audio.
 */
export function buildTranscriptionPrompt(sourceLanguage: string): string {
    return `Transcribe this ${sourceLanguage} audio recording. Return only the transcript text, no additional commentary. If there is no speech, return an empty string.`;
}
