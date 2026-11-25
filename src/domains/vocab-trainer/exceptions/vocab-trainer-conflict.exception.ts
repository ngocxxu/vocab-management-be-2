import { ConflictException } from '@nestjs/common';

export class VocabTrainerConflictException extends ConflictException {
    public constructor(reason: string) {
        super(reason);
    }
}
