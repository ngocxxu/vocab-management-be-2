import { BadRequestException } from '@nestjs/common';

/** A word can only move to a folder with the same source and target language, so its codes stay true. */
export class VocabFolderLanguageMismatchException extends BadRequestException {
    public constructor() {
        super('The new folder must use the same source and target language as this word.');
    }
}
