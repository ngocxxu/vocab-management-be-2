import { ConflictException } from '@nestjs/common';
import { TLanguageUsage } from '../utils';

/** A language cannot be deleted while a vocab or a folder still uses it. Deleting it would cascade into those rows. */
export class LanguageInUseException extends ConflictException {
    public constructor(languageId: string, languageName: string, usage: TLanguageUsage) {
        super({
            message: `Cannot delete language ${languageName}. ${usage.vocabCount} vocabs and ${usage.folderCount} folders use it.`,
            error: 'LanguageInUse',
            details: { languageId, languageName, vocabCount: usage.vocabCount, folderCount: usage.folderCount },
        });
    }
}
