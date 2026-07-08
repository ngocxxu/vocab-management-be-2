import { ForbiddenException } from '@nestjs/common';

export class ApiKeyForbiddenException extends ForbiddenException {
    public constructor(requiredScope: string) {
        super(`API key is missing required scope: ${requiredScope}`);
    }
}
