import { BadRequestException } from '@nestjs/common';

/** The code is the key vocabs and folders point at. Changing it would silently re-point their rows. */
export class LanguageCodeImmutableException extends BadRequestException {
    public constructor(currentCode: string) {
        super(`Language code cannot be changed. It stays ${currentCode}; create a new language instead.`);
    }
}
