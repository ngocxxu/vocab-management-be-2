import { UnauthorizedException } from '@nestjs/common';

/** The token is valid but its issuer + subject is not mapped to a User yet. Clients match on the `identity_not_provisioned` message. */
export class IdentityUnauthorizedException extends UnauthorizedException {
    public constructor() {
        super('identity_not_provisioned');
    }
}
