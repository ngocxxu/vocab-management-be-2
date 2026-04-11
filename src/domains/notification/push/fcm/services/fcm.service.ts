import { IResponse, LoggerService } from '@/shared';
import { Injectable } from '@nestjs/common';
import { User, UserFcmToken } from '@prisma/client';
import { FcmTokenDto, RegisterFcmTokenInput, UnregisterFcmTokenInput } from '../dto';
import { FcmTokenInactiveException, FcmTokenNotFoundException } from '../exceptions';
import { UserFcmTokenRepository } from '../repositories';

@Injectable()
export class FcmService {
    public constructor(
        private readonly userFcmTokenRepository: UserFcmTokenRepository,
        private readonly logger: LoggerService,
    ) {}

    public async registerToken(user: User, input: RegisterFcmTokenInput): Promise<FcmTokenDto> {
        const existingToken = await this.userFcmTokenRepository.findByUserAndToken(user.id, input.fcmToken);

        if (existingToken) {
            if (!existingToken.isActive) {
                const updatedToken = await this.userFcmTokenRepository.updateByUserAndToken(user.id, input.fcmToken, {
                    isActive: true,
                    deviceType: input.deviceType,
                    deletedAt: null,
                    updatedAt: new Date(),
                });

                this.logger.info(`Reactivated FCM token for user ${user.id}`);
                return new FcmTokenDto(updatedToken);
            }
            if (input.deviceType && input.deviceType !== existingToken.deviceType) {
                const updatedToken = await this.userFcmTokenRepository.updateByUserAndToken(user.id, input.fcmToken, {
                    deviceType: input.deviceType,
                    updatedAt: new Date(),
                });

                this.logger.info(`Updated FCM token device type for user ${user.id}`);
                return new FcmTokenDto(updatedToken);
            }

            return new FcmTokenDto(existingToken);
        }

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
    }

    public async unregisterToken(user: User, input: UnregisterFcmTokenInput): Promise<FcmTokenDto> {
        const token = await this.userFcmTokenRepository.findByUserAndToken(user.id, input.fcmToken);

        if (!token) {
            throw new FcmTokenNotFoundException();
        }

        if (!token.isActive) {
            throw new FcmTokenInactiveException();
        }

        const deletedToken = await this.userFcmTokenRepository.updateByUserAndToken(user.id, input.fcmToken, {
            isActive: false,
            deletedAt: new Date(),
            deletedBy: user.id,
            updatedAt: new Date(),
        });

        this.logger.info(`Unregistered FCM token for user ${user.id}`);
        return new FcmTokenDto(deletedToken);
    }

    public async getUserTokens(userId: string): Promise<IResponse<FcmTokenDto[]>> {
        const tokens = await this.userFcmTokenRepository.findManyActiveByUserId(userId);

        return {
            items: tokens.map((t) => new FcmTokenDto(t)),
            statusCode: 200,
        };
    }

    public async getTokensForUsers(userIds: string[]): Promise<UserFcmToken[]> {
        return this.userFcmTokenRepository.findManyActiveByUserIds(userIds);
    }
}
