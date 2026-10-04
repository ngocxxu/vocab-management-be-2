import { ConfigService } from '@/domains/platform/config/services/config.service';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { FsrsDirection, Prisma } from '@prisma/client';
import { isValidTimezone, SRS_TIMEZONE_CONFIG_KEY } from '../../vocab/utils/fsrs-local-day.util';
import { SRS_DEFAULTS_CONFIG_KEY, SrsDefaults, SrsSettings, SYSTEM_SRS_DEFAULTS, srsDefaultsPatchSchema, updateSrsSettingsSchema } from '../utils/fsrs-defaults.schema';

type CreateRequestFsrsFields = { fsrsDesiredRetention?: number; fsrsDirections?: FsrsDirection[]; reminderDisabled?: boolean };

/**
 * The FSRS defaults of a user, kept in Config (scope USER). Order of precedence when a trainer is created: what the request
 * carries, then the defaults of the user, then the system defaults. The trainer keeps its own copy, so changing the defaults
 * later never changes a cycle that is already running. A stored value that is not valid is ignored instead of breaking the app.
 */
@Injectable()
export class FsrsDefaultsService {
    public constructor(private readonly configService: ConfigService) {}

    public async getSettings(userId: string): Promise<SrsSettings> {
        const [stored, timezone] = await Promise.all([
            this.configService.getConfig(userId, SRS_DEFAULTS_CONFIG_KEY),
            this.configService.getConfig(userId, SRS_TIMEZONE_CONFIG_KEY),
        ]);

        return { defaults: this.withSystemDefaults(stored), timezone: typeof timezone === 'string' && isValidTimezone(timezone) ? timezone : null };
    }

    /** Saves only the fields that are sent; the others keep the value they have. Nothing is saved when one value is invalid. */
    public async updateSettings(userId: string, input: unknown): Promise<SrsSettings> {
        const parsed = updateSrsSettingsSchema.safeParse(input);
        if (!parsed.success) {
            throw new BadRequestException(parsed.error.issues.map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`).join('; '));
        }

        const { defaults, timezone } = parsed.data;
        if (defaults) {
            const current = await this.getSettings(userId);
            await this.configService.setUserConfig(userId, SRS_DEFAULTS_CONFIG_KEY, { ...current.defaults, ...defaults } as Prisma.InputJsonValue);
        }
        if (timezone) {
            await this.configService.setUserConfig(userId, SRS_TIMEZONE_CONFIG_KEY, timezone);
        }

        return this.getSettings(userId);
    }

    /** The values a new FSRS trainer is created with: the request first, then the defaults of the user. */
    public async resolveForCreate(userId: string, input: CreateRequestFsrsFields): Promise<Required<CreateRequestFsrsFields>> {
        const { defaults } = await this.getSettings(userId);

        return {
            fsrsDesiredRetention: input.fsrsDesiredRetention ?? defaults.desiredRetention,
            fsrsDirections: input.fsrsDirections ?? defaults.directions,
            reminderDisabled: input.reminderDisabled ?? !defaults.reminderEnabled,
        };
    }

    private withSystemDefaults(stored: unknown): SrsDefaults {
        const parsed = srsDefaultsPatchSchema.safeParse(stored);

        return { ...SYSTEM_SRS_DEFAULTS, directions: [...SYSTEM_SRS_DEFAULTS.directions], ...(parsed.success ? parsed.data : {}) };
    }
}
