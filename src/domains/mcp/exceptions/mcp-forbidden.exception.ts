import { ForbiddenException } from '@nestjs/common';

export class McpForbiddenException extends ForbiddenException {
    public constructor(message: string) {
        super(message);
    }
}
