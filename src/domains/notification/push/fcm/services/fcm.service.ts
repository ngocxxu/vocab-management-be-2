import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { User, UserFcmToken } from '@prisma/client';
import { IResponse, LoggerService } from '@/shared';
import { PrismaErrorHandler } from '@/shared/handlers/error.handler';
import { FcmTokenDto, RegisterFcmTokenInput, UnregisterFcmTokenInput } from '../dto';
import { UserFcmTokenRepository } from '../repositories';

@Injectable()
export class FcmService {
    // Custom error mapping for FCM
    private readonly fcmErrorMapping = {
        P2002: 'FCM token already registered for this user',
        P2025: {
            update: 'FCM token not found',
            delete: 'FCM token not found',
            findOne: 'FCM token not found',
        },
    };

    public constructor(
        private readonly userFcmTokenRepository: UserFcmTokenRepository,
        private readonly logger: LoggerService,
    ) {}

    /**
     * Register FCM token for a user
     */
    public async registerToken(user: User, input: RegisterFcmTokenInput): Promise<FcmTokenDto> {
        try {
            // Check if token already exists for this user
            const existingToken = await this.userFcmTokenRepository.findByUserAndToken(
                user.id,
                input.fcmToken,
            );

            if (existingToken) {
                // Update existing token if it was soft deleted
                if (!existingToken.isActive) {
                    const updatedToken = await this.userFcmTokenRepository.updateByUserAndToken(
                        user.id,
                        input.fcmToken,
                        {
                            isActive: true,
                            deviceType: input.deviceType,
                            deletedAt: null,
                            updatedAt: new Date(),
                        },
                    );

                    this.logger.info(`Reactivated FCM token for user ${user.id}`);
                    return new FcmTokenDto(updatedToken);
                } else {
                    // Token is already active, update device type if provided
                    if (input.deviceType && input.deviceType !== existingToken.deviceType) {
                        const updatedToken = await this.userFcmTokenRepository.updateByUserAndToken(
                            user.id,
                            input.fcmToken,
                            {
                                deviceType: input.deviceType,
                                updatedAt: new Date(),
                            },
                        );

                        this.logger.info(`Updated FCM token device type for user ${user.id}`);
                        return new FcmTokenDto(updatedToken);
                    }

                    return new FcmTokenDto(existingToken);
                }
            }

            // Create new token
            const newToken = await this.userFcmTokenRepository.create({
                userId: user.id,
                fcmToken: input.fcmToken,
                deviceType: input.deviceType,
                isActive: true,
                createdBy: user.id,
                updatedBy: user.id,
            });

            this.logger.info(`Registered new FCM token for user ${user.id}`);
            return new FcmTokenDto(newToken);
        } catch (error) {
            PrismaErrorHandler.handle(error, 'registerToken', this.fcmErrorMapping);
        }
    }

    /**
     * Unregister FCM token for a user
     */
    public async unregisterToken(user: User, input: UnregisterFcmTokenInput): Promise<FcmTokenDto> {
        try {
            const token = await this.userFcmTokenRepository.findByUserAndToken(
                user.id,
                input.fcmToken,
            );

            if (!token) {
                throw new NotFoundException('FCM token not found');
            }

            if (!token.isActive) {
                throw new ConflictException('FCM token is already inactive');
            }

            // Soft delete the token
            const deletedToken = await this.userFcmTokenRepository.updateByUserAndToken(
                user.id,
                input.fcmToken,
                {
                    isActive: false,
                    deletedAt: new Date(),
                    deletedBy: user.id,
                    updatedAt: new Date(),
                },
            );

            this.logger.info(`Unregistered FCM token for user ${user.id}`);
            return new FcmTokenDto(deletedToken);
        } catch (error) {
            if (error instanceof NotFoundException || error instanceof ConflictException) {
                throw error;
            }
            PrismaErrorHandler.handle(error, 'unregisterToken', this.fcmErrorMapping);
        }
    }

    /**
     * Get all active FCM tokens for a user
     */
    public async getUserTokens(userId: string): Promise<IResponse<FcmTokenDto[]>> {
        try {
            const tokens = await this.userFcmTokenRepository.findManyActiveByUserId(userId);

            return {
                items: tokens.map((token) => new FcmTokenDto(token)),
                statusCode: 200,
            };
        } catch (error) {
            PrismaErrorHandler.handle(error, 'getUserTokens', this.fcmErrorMapping);
        }
    }

    /**
     * Get all active FCM tokens for multiple users
     */
    public async getTokensForUsers(userIds: string[]): Promise<UserFcmToken[]> {
        try {
            return this.userFcmTokenRepository.findManyActiveByUserIds(userIds);
        } catch (error) {
            PrismaErrorHandler.handle(error, 'getTokensForUsers', this.fcmErrorMapping);
        }
    }
}
