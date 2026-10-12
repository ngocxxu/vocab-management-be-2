import { BadGatewayException } from '@nestjs/common';

/** Supabase refused the account delete. Nothing was deleted locally. */
export class AdminUserDeleteFailedException extends BadGatewayException {
    public constructor(reason: string) {
        super(`Supabase account could not be deleted: ${reason}`);
    }
}
