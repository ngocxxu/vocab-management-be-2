import { ForbiddenException } from '@nestjs/common';

export class PlanQuotaExceededException extends ForbiddenException {
    public constructor(message: string) {
        super(message);
    }
}
