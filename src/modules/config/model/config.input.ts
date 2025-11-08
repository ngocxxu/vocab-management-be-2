import { ApiProperty } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';

export class ConfigInput {
    @ApiProperty({
        description: 'Config value (JSON)',
        example: 'gemini-2.0-flash-lite',
    })
    public readonly value: Prisma.InputJsonValue;
}
