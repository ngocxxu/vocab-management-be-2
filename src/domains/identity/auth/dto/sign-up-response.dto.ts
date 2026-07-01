import { ApiProperty } from '@nestjs/swagger';

import { SessionDto } from './auth.dto';

export class SignUpResponseDto {
    @ApiProperty({ type: SessionDto, required: false, nullable: true })
    public readonly session: SessionDto | null;

    @ApiProperty({ example: 'confirmation_email_sent', required: false, nullable: true })
    public readonly message: string | null;

    public constructor(session: SessionDto | null, message: string | null) {
        this.session = session;
        this.message = message;
    }
}
