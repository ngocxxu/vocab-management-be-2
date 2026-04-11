import { BadRequestException } from '@nestjs/common';

export class ConfigBadRequestException extends BadRequestException {
    public constructor(reason: string) {
        super(reason);
    }
}
