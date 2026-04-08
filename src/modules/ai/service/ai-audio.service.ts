import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { AiProviderFactory } from '../provider/ai-provider.factory';
import { AI_CONFIG } from '../util/const.util';

@Injectable()
export class AiAudioService {
    private readonly logger = new Logger(AiAudioService.name);

    public constructor(private readonly providerFactory: AiProviderFactory) {}

    public async downloadAudioFromCloudinary(fileId: string): Promise<Buffer> {
        try {
            const cloudinaryUrl = process.env.CLOUDINARY_URL;
            if (!cloudinaryUrl) {
                throw new Error('CLOUDINARY_URL environment variable is required');
            }

            const urlMatch = /cloudinary:\/\/([^:]+):([^@]+)@(.+)/.exec(cloudinaryUrl);
            if (!urlMatch) {
                throw new Error('Invalid CLOUDINARY_URL format');
            }

            const [, , , cloudName] = urlMatch;
            const url = `https://res.cloudinary.com/${cloudName}/raw/upload/${fileId}`;

            const response = await axios.get(url, {
                responseType: 'arraybuffer',
            });

            return Buffer.from(response.data);
        } catch (error) {
            this.logger.error(`Failed to download audio from Cloudinary: ${error}`);
            throw new Error(
                `Failed to download audio: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
        }
    }

    public async transcribeAudio(
        audioBuffer: Buffer,
        mimeType: string,
        sourceLanguage: string,
        userId?: string,
        retryCount = 0,
    ): Promise<string> {
        try {
            const provider = await this.providerFactory.getAudioProvider(userId);
            return await provider.transcribeAudio(audioBuffer, mimeType, sourceLanguage, userId);
        } catch (error) {
            this.logger.error(`Error transcribing audio (attempt ${retryCount + 1}):`, error);

            if (retryCount < AI_CONFIG.maxRetries) {
                this.logger.warn('Retrying audio transcription...');
                await new Promise((resolve) =>
                    setTimeout(resolve, AI_CONFIG.retryDelayMs * (retryCount + 1)),
                );
                return this.transcribeAudio(
                    audioBuffer,
                    mimeType,
                    sourceLanguage,
                    userId,
                    retryCount + 1,
                );
            }

            throw error;
        }
    }
}

