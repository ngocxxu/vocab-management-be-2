import { BadRequestException } from '@nestjs/common';

export class McpBadRequestException extends BadRequestException {
    public constructor(message: string) {
        super(message);
    }
}
