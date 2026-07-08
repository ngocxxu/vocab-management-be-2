import { UnauthorizedException } from '@nestjs/common';

export class ApiKeyUnauthorizedException extends UnauthorizedException {
    public constructor(reason: string) {
        super(reason);
    }
}
