import { ConflictException } from '@nestjs/common';

export type AuthConflictCode = 'email_already_registered' | 'account_link_required' | 'identity_already_linked';

const MESSAGES: Record<AuthConflictCode, string> = {
    email_already_registered: 'An account with this email already exists',
    // Machine-readable on purpose: the frontend matches on it to show the "sign in the old way, then connect it in Settings" state.
    account_link_required: 'account_link_required',
    // The sign-in method being connected already belongs to another User.
    identity_already_linked: 'identity_already_linked',
};

export class AuthConflictException extends ConflictException {
    public readonly code: AuthConflictCode;

    public constructor(code: AuthConflictCode) {
        super(MESSAGES[code]);
        this.code = code;
    }
}
