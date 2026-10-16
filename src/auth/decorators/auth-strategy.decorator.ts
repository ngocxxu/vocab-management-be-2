import { SetMetadata } from '@nestjs/common';

export const AUTH_STRATEGY_KEY = 'authStrategy';

export type AuthStrategyValue = 'auth0' | 'supabase' | 'combined';

export const AuthStrategy = (strategy: AuthStrategyValue) => SetMetadata(AUTH_STRATEGY_KEY, strategy);
