import { BadRequestException } from '@nestjs/common';

export class UserBadRequestException extends BadRequestException {
    public constructor(reason: string) {
        super(reason);
    }
}
