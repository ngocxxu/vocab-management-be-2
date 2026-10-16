import { SetMetadata } from '@nestjs/common';

export const ALLOW_UNPROVISIONED_KEY = 'allowUnprovisioned';

/**
 * Lets a valid token whose Identity is not mapped to a User yet reach the handler (only the Provisioning endpoint needs this).
 * Every other route rejects such a token with 401 `identity_not_provisioned`.
 */
export const AllowUnprovisioned = () => SetMetadata(ALLOW_UNPROVISIONED_KEY, true);
