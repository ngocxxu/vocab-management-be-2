import { PayloadTooLargeException } from '@nestjs/common';

export class McpPayloadTooLargeException extends PayloadTooLargeException {
    public constructor(message: string) {
        super(message);
    }
}
