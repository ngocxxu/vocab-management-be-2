import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString } from 'class-validator';

/**
 * Body of PUT /srs-settings. The values themselves are checked by the zod schema in FsrsDefaultsService (one place for
 * the rules, shared with the stored value); the decorators here only make sure the body has the right shape.
 */
export class UpdateSrsSettingsInput {
    @ApiProperty({
        description: 'Defaults for new FSRS trainers; only the fields that are sent change',
        required: false,
        example: { desiredRetention: 0.9, directions: ['SOURCE_TO_TARGET', 'TARGET_TO_SOURCE'], questionType: 'FLIP_CARD', reminderEnabled: true },
    })
    @IsOptional()
    @IsObject()
    public defaults?: Record<string, unknown>;

    @ApiProperty({ description: 'IANA timezone: the day of review starts at 04:00 in it', required: false, example: 'Asia/Ho_Chi_Minh' })
    @IsOptional()
    @IsString()
    public timezone?: string;
}
