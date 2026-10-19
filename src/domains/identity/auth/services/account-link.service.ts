import type { Auth0IdToken } from '@/auth';
import { AuthTokenService } from '@/auth/services/auth-token.service';
import { LoggerService } from '@/shared/services/logger.service';
import { captureSentryException } from '@/shared/utils/sentry.util';
import { Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { randomBytes } from 'crypto';
import { UserIdentityRepository } from '../../user/repositories';
import { AuthConflictException, AuthForbiddenException } from '../exceptions';
import { LinkNonceRepository } from '../repositories';
import { signInMethodFromSubject } from '../utils';

/** A nonce lives as long as a sign-in may be old, so a login that finishes after the nonce expired could not be linked anyway. */
const LINK_NONCE_TTL_SECONDS = 300;
const LINK_NONCE_BYTES = 32;
/** How old the second login's `auth_time` may be. The FE forces a new sign-in right before linking (`prompt=login`, `max_age=300`). */
const LINK_PROOF_MAX_AGE_SECONDS = 300;
/** An `auth_time` slightly in the future is normal clock drift; further ahead than this is refused. */
const LINK_PROOF_MAX_FUTURE_SECONDS = 60;
/** Logged in place of the issuer when the token did not verify, so its unverified `iss` is never trusted. */
const UNVERIFIED_ISSUER = 'unverified';
/** Refusals that point to something unusual (a replayed or stolen proof, or a login already taken) and are reported to Sentry. */
const UNUSUAL_REFUSALS = new Set<string>(['identity_already_linked', 'link_proof_stale', 'link_nonce_invalid']);

@Injectable()
export class AccountLinkService {
    public constructor(
        private readonly authTokenService: AuthTokenService,
        private readonly userIdentityRepository: UserIdentityRepository,
        private readonly linkNonceRepository: LinkNonceRepository,
        private readonly logger: LoggerService,
    ) {}

    /** Step 1 of an Account link: a single-use nonce bound to the signed-in User. The FE sends it to Auth0 so the ID token carries it back. */
    public async issueNonce(currentUser: User): Promise<string> {
        const nonce = randomBytes(LINK_NONCE_BYTES).toString('base64url');
        await this.linkNonceRepository.create(currentUser.id, nonce, new Date(Date.now() + LINK_NONCE_TTL_SECONDS * 1000));
        this.logger.info(`Account link nonce issued for user ${currentUser.id}`);
        return nonce;
    }

    /**
     * Account link (GLOSSARY.md, ADR 0004): attaches the Identity behind `idToken` to the signed-in User.
     * The signed-in session decides who is linked, never the email. The ID token is the proof the User controls that login:
     * it must be an Auth0 ID token of the web app, carry a nonce this User asked for, come from a fresh sign-in, and have a verified email.
     * The nonce is spent before the later checks, so it cannot be retried. Idempotent for the same pair.
     * Every attempt is logged with the User id and the issuer, never the email.
     */
    public async linkAuth0Identity(currentUser: User, idToken: string): Promise<void> {
        const proof = await this.verifyProof(currentUser, idToken);
        const { issuer, subject } = proof;
        await this.spendNonce(currentUser, proof);
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

    /** Verifies the second login's ID token. One that does not verify is logged (issuer unknown) and rethrown unchanged. */
    private async verifyProof(currentUser: User, idToken: string): Promise<Auth0IdToken> {
        try {
            return await this.authTokenService.verifyIdToken(idToken);
        } catch (error: unknown) {
            this.logger.warn(`Account link refused for user ${currentUser.id} (issuer ${UNVERIFIED_ISSUER}): id_token_invalid`);
            throw error;
        }
    }

    /** The nonce in the token must be one this User asked for, unused and unexpired. Spending it is one conditional update. */
    private async spendNonce(currentUser: User, proof: Auth0IdToken): Promise<void> {
        const spent = proof.nonce ? await this.linkNonceRepository.consume(proof.nonce, currentUser.id, new Date(Date.now())) : false;
        if (!spent) {
            throw this.refuse(currentUser, proof.issuer, new AuthForbiddenException('link_nonce_invalid'));
        }
    }

    /** `auth_time` is when the user really signed in. `iat` is not used: a refresh gives a fresh `iat` without a new sign-in. */
    private isFresh(proof: Auth0IdToken): boolean {
        if (proof.authTime === undefined) {
            return false;
        }
        const ageSeconds = Math.floor(Date.now() / 1000) - proof.authTime;
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
