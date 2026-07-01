import { ConflictException } from '@nestjs/common';

export type AuthConflictCode = 'email_already_registered';

const MESSAGES: Record<AuthConflictCode, string> = {
    email_already_registered: 'An account with this email already exists',
};

export class AuthConflictException extends ConflictException {
    public readonly code: AuthConflictCode;

    public constructor(code: AuthConflictCode) {
        super(MESSAGES[code]);
        this.code = code;
    }
}
