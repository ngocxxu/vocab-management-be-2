import { UnauthorizedException } from '@nestjs/common';

export class AuthSupabaseMessageException extends UnauthorizedException {
    public constructor(message: string) {
        super(message);
    }
}
