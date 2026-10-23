import { ConflictException } from '@nestjs/common';

export class AiConflictException extends ConflictException {
    public constructor(detail?: string) {
        super(detail ?? 'Another AI job is already running for this user');
    }
}
