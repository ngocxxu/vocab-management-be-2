import { ForbiddenException } from '@nestjs/common';

export type AuthForbiddenCode = 'email_not_verified' | 'auth0_identity_required' | 'link_proof_stale' | 'link_nonce_invalid';

/** The message is the machine-readable code; clients match on it. */
export class AuthForbiddenException extends ForbiddenException {
    public readonly code: AuthForbiddenCode;

    public constructor(code: AuthForbiddenCode) {
        super(code);
        this.code = code;
    }
}
