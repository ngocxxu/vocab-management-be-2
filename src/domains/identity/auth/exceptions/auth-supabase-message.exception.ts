import { HttpException, HttpStatus } from '@nestjs/common';

export class AuthSupabaseMessageException extends HttpException {
    public constructor(message: string, status: HttpStatus = HttpStatus.UNAUTHORIZED) {
        super(message, status);
    }
}
