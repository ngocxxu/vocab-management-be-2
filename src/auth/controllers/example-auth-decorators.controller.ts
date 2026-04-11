import type { AuthUser } from '../interfaces/auth-user.interface';
import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AuthStrategy, CurrentUser, Public, Roles, UseThrottle } from '../decorators';
import { CombinedAuthGuard, JwtAuthGuard, RolesGuard } from '../guards';

@ApiTags('auth-examples')
@Controller('auth/examples')
export class ExampleAuthDecoratorsController {
    @Public()
    @Get('public')
    @ApiOperation({ summary: 'Public route (no Bearer token)' })
    public getPublic(): { ok: boolean } {
        return { ok: true };
    }

    @Get('combined-default')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Protected with default combined JWT then Firebase strategy' })
    public getCombinedDefault(@CurrentUser() user: AuthUser): AuthUser {
        return user;
    }

    @AuthStrategy('jwt')
    @Get('jwt-only')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'App JWT only' })
    public getJwtOnly(@CurrentUser() user: AuthUser): AuthUser {
        return user;
    }

    @AuthStrategy('firebase')
    @Get('firebase-only')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Firebase ID token only' })
    public getFirebaseOnly(@CurrentUser() user: AuthUser): AuthUser {
        return user;
    }

    @UseGuards(RolesGuard)
    @Roles(['admin', 'user'])
    @Get('roles')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Requires admin or user role from token claims' })
    public getWithRoles(@CurrentUser() user: AuthUser): AuthUser {
        return user;
    }

    @UseGuards(JwtAuthGuard)
    @Get('explicit-jwt-guard')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Explicit JwtAuthGuard (re-verifies as app JWT)' })
    public getExplicitJwt(@CurrentUser() user: AuthUser): AuthUser {
        return user;
    }

    @UseThrottle({ default: { limit: 5, ttl: 60000 } })
    @Get('throttled')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Stricter rate limit via UseThrottle alias' })
    public getThrottled(@CurrentUser() user: AuthUser): AuthUser {
        return user;
    }

    @UseGuards(CombinedAuthGuard)
    @Get('explicit-combined-guard')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Explicit CombinedAuthGuard' })
    public getExplicitCombined(@CurrentUser() user: AuthUser): AuthUser {
        return user;
    }
}
