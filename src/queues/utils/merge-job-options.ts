import type { JobsOptions } from 'bullmq';

function mergeBackoff(defaults: JobsOptions['backoff'], caller: JobsOptions['backoff']): JobsOptions['backoff'] {
    if (defaults && caller && typeof defaults === 'object' && typeof caller === 'object' && !Array.isArray(defaults) && !Array.isArray(caller)) {
        return { ...defaults, ...caller };
    }
    if (caller !== undefined) {
        return caller;
    }
    return defaults;
}

export function mergeJobOptions(defaults: JobsOptions, caller?: JobsOptions): JobsOptions {
    if (!caller || Object.keys(caller).length === 0) {
        return { ...defaults };
    }
    const merged: JobsOptions = { ...defaults, ...caller };
    merged.backoff = mergeBackoff(defaults.backoff, caller.backoff);
    return merged;
}
