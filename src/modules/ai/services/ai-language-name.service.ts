import { Injectable, Logger } from '@nestjs/common';
import { LanguageRepository } from '../../language/repositories';

@Injectable()
export class AiLanguageNameService {
    private readonly logger = new Logger(AiLanguageNameService.name);
    private readonly languageNameCache = new Map<string, string>();

    public constructor(private readonly languageRepository: LanguageRepository) {}

    public async getLanguageName(code: string): Promise<string> {
        if (!code) {
            throw new Error('Language code is required');
        }

        const cached = this.languageNameCache.get(code);
        if (cached) {
            return cached;
        }

        const language = await this.languageRepository.findByCode(code);
        if (!language) {
            this.logger.warn(`Language not found for code: ${code}, using code as fallback`);
            return code;
        }

        this.languageNameCache.set(code, language.name);
        return language.name;
    }
}

