import { BadRequestException } from '@nestjs/common';

/** An update that names neither `role` nor `isActive`. */
export class AdminUserInvalidChangeException extends BadRequestException {
    public constructor() {
        super('Provide role or isActive');
    }
}
