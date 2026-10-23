import type { JobOptions } from 'bull';

function mergeBackoff(defaults: JobOptions['backoff'], caller: JobOptions['backoff']): JobOptions['backoff'] {
    if (defaults && caller && typeof defaults === 'object' && typeof caller === 'object' && !Array.isArray(defaults) && !Array.isArray(caller)) {
        return { ...defaults, ...caller };
    }
    if (caller !== undefined) {
        return caller;
    }
    return defaults;
}

export function mergeJobOptions(defaults: JobOptions, caller?: JobOptions): JobOptions {
    if (!caller || Object.keys(caller).length === 0) {
        return { ...defaults };
    }
    const merged: JobOptions = { ...defaults, ...caller };
    merged.backoff = mergeBackoff(defaults.backoff, caller.backoff);
    return merged;
}
