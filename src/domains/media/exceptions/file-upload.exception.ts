import { BadRequestException } from '@nestjs/common';

export class FileUploadException extends BadRequestException {
    public constructor(reason: string) {
        super(reason);
    }
}
