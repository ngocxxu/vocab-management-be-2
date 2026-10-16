import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, JWTVerifyGetKey } from 'jose';

/** Lazily builds the remote key set for the configured Auth0 tenant. jose caches keys and refetches on rotation. */
@Injectable()
export class Auth0JwksProvider {
    private resolver?: JWTVerifyGetKey;

    public constructor(private readonly configService: ConfigService) {}

    public getKeyResolver(): JWTVerifyGetKey {
        if (!this.resolver) {
            const issuer = this.configService.getOrThrow<string>('auth0.issuer');
            this.resolver = createRemoteJWKSet(new URL('.well-known/jwks.json', issuer));
        }
        return this.resolver;
    }
}
