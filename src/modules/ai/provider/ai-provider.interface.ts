export interface GenerateContentOptions {
    audioBuffer?: Buffer;
    audioMimeType?: string;
}

export interface IAiProvider {
    generateContent(
        prompt: string,
        userId?: string,
        options?: GenerateContentOptions,
    ): Promise<string>;

    transcribeAudio(
        audioBuffer: Buffer,
        mimeType: string,
        sourceLanguage: string,
        userId?: string,
    ): Promise<string>;

    getModelName(userId?: string): Promise<string>;

    getAudioModelName(userId?: string): Promise<string>;
}

