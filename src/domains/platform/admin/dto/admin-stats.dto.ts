import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

export class AdminSignupDayDto {
    @ApiProperty({ description: 'UTC day, YYYY-MM-DD', example: '2026-10-12' })
    public readonly date: string;

    @ApiProperty({ description: 'Users created on that UTC day' })
    public readonly count: number;
}

export class AdminUserStatsDto {
    @ApiProperty({ description: 'All users' })
    public readonly total: number;

    @ApiProperty({ description: 'Users with isActive = true' })
    public readonly active: number;

    @ApiProperty({ description: 'Users with isActive = false' })
    public readonly inactive: number;

    @ApiProperty({ description: 'User count per role; every role is present, zero when empty', type: 'object', additionalProperties: { type: 'integer' } })
    public readonly byRole: Record<UserRole, number>;

    @ApiProperty({ description: 'Users created in the last 7 days (rolling)' })
    public readonly new7d: number;

    @ApiProperty({ description: 'Users created in the last 30 days (rolling)' })
    public readonly new30d: number;
}

export class AdminContentStatsDto {
    @ApiProperty({ description: 'All vocabs' })
    public readonly vocabs: number;

    @ApiProperty({ description: 'All vocab trainers' })
    public readonly trainers: number;

    @ApiProperty({ description: 'All trainer results' })
    public readonly examResults: number;

    @ApiProperty({ description: 'FSRS review logs in the last 7 days (rolling)' })
    public readonly reviews7d: number;
}

export class AdminOpsStatsDto {
    @ApiProperty({ description: 'Job failures in the last 24 hours (rolling)' })
    public readonly jobFailures24h: number;
}

/** Response of GET /admin/stats. Mirrored by the FE type TAdminStats; change both together. */
export class AdminStatsDto {
    @ApiProperty({ type: AdminUserStatsDto })
    public readonly users: AdminUserStatsDto;

    @ApiProperty({ type: [AdminSignupDayDto], description: 'Exactly 30 entries, oldest first, zero-filled. Dates are UTC.' })
    public readonly signupsDaily: AdminSignupDayDto[];

    @ApiProperty({ type: AdminContentStatsDto })
    public readonly content: AdminContentStatsDto;

    @ApiProperty({ type: AdminOpsStatsDto })
    public readonly ops: AdminOpsStatsDto;
}
