import { applyDecorators } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, Max, Min, ValidateBy, ValidateIf } from 'class-validator';
import { MAX_PLAN_LIMIT, PLAN_LIMIT_KEYS, UNLIMITED_LIMIT } from '../utils';

/** One typed limit: an absent key is skipped, a present one must be an integer from -1 (unlimited) up to the bound. */
function PlanLimit(description: string, example: number): PropertyDecorator {
    return applyDecorators(
        ApiPropertyOptional({ example, description }),
        ValidateIf((_, value) => value !== undefined),
        IsInt(),
        Min(UNLIMITED_LIMIT),
        Max(MAX_PLAN_LIMIT),
    );
}

/**
 * Rejects a limits value that would persist nothing: an array, an empty object, or an object with only unknown keys.
 * Storing `{}` would silently reset every limit to its default.
 */
export function HasKnownPlanLimit(): PropertyDecorator {
    return ValidateBy({
        name: 'hasKnownPlanLimit',
        validator: {
            validate: (value: unknown): boolean =>
                typeof value === 'object' && value !== null && !Array.isArray(value) && PLAN_LIMIT_KEYS.some((key) => (value as Record<string, unknown>)[key] !== undefined),
            defaultMessage: () => `limits must set at least one of: ${PLAN_LIMIT_KEYS.join(', ')}`,
        },
    });
}

/**
 * Typed plan limits. No coercion: '5', 2.5 and null are rejected rather than converted.
 * -1 means unlimited. A key that is absent is skipped, so a partial limits object is valid.
 */
export class PlanLimitsInput {
    @PlanLimit('Max vocabs per day (-1 = unlimited)', 20)
    public vocabPerDay?: number;

    @PlanLimit('Max language folders (-1 = unlimited)', 2)
    public languageFolders?: number;

    @PlanLimit('Max subjects (-1 = unlimited)', 5)
    public subjects?: number;

    @PlanLimit('Max requests per minute (-1 = unlimited)', 20)
    public requestsPerMinute?: number;
}
