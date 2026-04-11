import { UnauthorizedException } from '@nestjs/common';

export class InvalidCredentialsException extends UnauthorizedException {
    public constructor() {
        super('Invalid email or password');
    }
}
