import { UnauthorizedException } from '@nestjs/common';

export class ChatUnauthorizedException extends UnauthorizedException {
    public constructor(message = 'Chat access unauthorized') {
        super(message);
    }
}
