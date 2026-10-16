import { ConflictException } from '@nestjs/common';

export type AuthConflictCode = 'email_already_registered' | 'account_link_required';

const MESSAGES: Record<AuthConflictCode, string> = {
    email_already_registered: 'An account with this email already exists',
    // Machine-readable on purpose: the frontend matches on it to show the "ask an admin to link your account" state.
    account_link_required: 'account_link_required',
};

export class AuthConflictException extends ConflictException {
    public readonly code: AuthConflictCode;

    public constructor(code: AuthConflictCode) {
        super(MESSAGES[code]);
        this.code = code;
    }
}
