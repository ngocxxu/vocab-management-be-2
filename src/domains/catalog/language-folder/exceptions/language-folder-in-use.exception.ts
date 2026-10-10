import { ConflictException } from '@nestjs/common';

/** A folder cannot be deleted while a vocab in it is still part of a trainer. Deleting the folder would delete those vocabs. */
export class LanguageFolderInUseException extends ConflictException {
    public constructor(folderId: string, folderName: string, blockedVocabCount: number, sampleVocabIds: string[] = []) {
        super({
            message: `Cannot delete folder. ${blockedVocabCount} vocabs in it are used by trainers.`,
            error: 'LanguageFolderInUse',
            details: { folderId, folderName, blockedVocabCount, sampleVocabIds },
        });
    }
}
