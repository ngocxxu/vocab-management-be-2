import type { AuthUser } from '@/auth';
import { AuthTokenService } from '@/auth/services/auth-token.service';
import { LoggerService } from '@/shared/services/logger.service';
import { captureSentryException } from '@/shared/utils/sentry.util';
import { Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { UserIdentityRepository } from '../../user/repositories';
import { AuthConflictException, AuthForbiddenException } from '../exceptions';
import { signInMethodFromSubject } from '../utils';

/** How old the second login's token may be. The FE forces a new sign-in right before linking, so a legitimate proof is seconds old. */
const LINK_PROOF_MAX_AGE_SECONDS = 300;
/** A token issued slightly in the future is normal clock drift; further ahead than this is refused. */
const LINK_PROOF_MAX_FUTURE_SECONDS = 60;
/** Logged in place of the issuer when the token did not verify, so its unverified `iss` is never trusted. */
const UNVERIFIED_ISSUER = 'unverified';
/** Refusals that point to something unusual (a replayed or stolen proof, or a login already taken) and are reported to Sentry. */
const UNUSUAL_REFUSALS = new Set<string>(['identity_already_linked', 'link_proof_stale']);

@Injectable()
export class AccountLinkService {
    public constructor(
        private readonly authTokenService: AuthTokenService,
        private readonly userIdentityRepository: UserIdentityRepository,
        private readonly logger: LoggerService,
    ) {}

    /**
     * Account link (GLOSSARY.md, ADR 0004): attaches the Identity behind `linkToken` to the signed-in User.
     * The signed-in session decides who is linked, never the email. The token is the proof the User controls that login,
     * so it must be an Auth0 token, fresh, with a verified email. Idempotent for the same pair.
     * Every attempt is logged with the User id and the issuer, never the email.
     */
    public async linkAuth0Identity(currentUser: User, linkToken: string): Promise<void> {
        const proof = await this.verifyProof(currentUser, linkToken);
        const { issuer, subject } = proof;
        if (!issuer || !subject) {
            throw this.refuse(currentUser, issuer ?? UNVERIFIED_ISSUER, new AuthForbiddenException('auth0_identity_required'));
        }
        if (!this.isFresh(proof)) {
            throw this.refuse(currentUser, issuer, new AuthForbiddenException('link_proof_stale'));
        }
        if (!proof.emailVerified) {
            throw this.refuse(currentUser, issuer, new AuthForbiddenException('email_not_verified'));
        }

        const owner = await this.userIdentityRepository.findUserByIdentity(issuer, subject);
        if (owner) {
            this.assertOwnedBy(currentUser, owner, issuer);
            return;
        }

        try {
            await this.userIdentityRepository.link(currentUser.id, issuer, subject);
        } catch (error: unknown) {
            if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
                throw error;
            }
            // Lost a race: whoever won owns it. Same User is success, anyone else is a conflict.
            const winner = await this.userIdentityRepository.findUserByIdentity(issuer, subject);
            if (!winner) {
                throw error;
            }
            this.assertOwnedBy(currentUser, winner, issuer);
            return;
        }
        this.logger.info(`Account link accepted for user ${currentUser.id} (issuer ${issuer}): linked`);
    }

    /** The User's sign-in methods as provider labels only; the subject and issuer never leave the server. */
    public async listSignInMethods(userId: string): Promise<string[]> {
        const identities = await this.userIdentityRepository.findByUserId(userId);
        return [...new Set(identities.map(({ subject }) => signInMethodFromSubject(subject)))].sort();
    }

    /** Verifies the second login as an Auth0 token. A token that does not verify is logged (issuer unknown) and rethrown unchanged. */
    private async verifyProof(currentUser: User, linkToken: string): Promise<AuthUser> {
        try {
            return await this.authTokenService.resolveAuthUser(linkToken, 'auth0');
        } catch (error: unknown) {
            this.logger.warn(`Account link refused for user ${currentUser.id} (issuer ${UNVERIFIED_ISSUER}): invalid_link_token`);
            throw error;
        }
    }

    private isFresh(proof: AuthUser): boolean {
        if (proof.issuedAt === undefined) {
            return false;
        }
        const ageSeconds = Math.floor(Date.now() / 1000) - proof.issuedAt;
        return ageSeconds >= -LINK_PROOF_MAX_FUTURE_SECONDS && ageSeconds <= LINK_PROOF_MAX_AGE_SECONDS;
    }

    private assertOwnedBy(currentUser: User, owner: User, issuer: string): void {
        if (owner.id === currentUser.id) {
            this.logger.info(`Account link accepted for user ${currentUser.id} (issuer ${issuer}): already linked`);
            return;
        }
        throw this.refuse(currentUser, issuer, new AuthConflictException('identity_already_linked'));
    }

    /** Logs a refused attempt (User id and issuer, never the email), reports the unusual ones to Sentry, and returns the exception to throw. */
    private refuse<E extends AuthConflictException | AuthForbiddenException>(currentUser: User, issuer: string, exception: E): E {
        this.logger.warn(`Account link refused for user ${currentUser.id} (issuer ${issuer}): ${exception.code}`);
        if (UNUSUAL_REFUSALS.has(exception.code)) {
            captureSentryException(exception, { tags: { area: 'account-link', code: exception.code }, contexts: { link: { userId: currentUser.id, issuer } } });
        }
        return exception;
    }
}
