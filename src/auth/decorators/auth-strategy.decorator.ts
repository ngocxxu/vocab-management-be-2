import { SetMetadata } from '@nestjs/common';

export const AUTH_STRATEGY_KEY = 'authStrategy';

export type AuthStrategyValue = 'jwt' | 'firebase' | 'combined';

export const AuthStrategy = (strategy: AuthStrategyValue) => SetMetadata(AUTH_STRATEGY_KEY, strategy);
