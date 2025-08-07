import { Body, Controller, Get, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { FirebaseService } from '../../../firebase';
import { AuthGuard, IResponse, LoggerService } from '../../common';
import { CurrentUser } from '../../common/decorator';
import {
    FcmTokenDto,
    RegisterFcmTokenInput,
    SendNotificationInput,
    UnregisterFcmTokenInput,
} from '../model';
import { FcmService } from '../service';

@Controller('fcm')
@ApiTags('fcm')
@ApiBearerAuth()
@UseGuards(AuthGuard)
export class FcmController {
    public constructor(
        private readonly logger: LoggerService,
        private readonly fcmService: FcmService,
        private readonly firebaseService: FirebaseService,
    ) {}

    @Post('register')
    @ApiOperation({ summary: 'Register FCM token for push notifications' })
    @ApiResponse({ status: HttpStatus.CREATED, type: FcmTokenDto })
    @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid input data' })
    @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
    public async registerToken(
        @Body() input: RegisterFcmTokenInput,
        @CurrentUser() user: User,
    ): Promise<FcmTokenDto> {
        const result = await this.fcmService.registerToken(user, input);
        this.logger.info(`User ${user.id} registered FCM token`);
        return result;
    }

    @Post('unregister')
    @ApiOperation({ summary: 'Unregister FCM token' })
    @ApiResponse({ status: HttpStatus.OK, type: FcmTokenDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'FCM token not found' })
    @ApiResponse({ status: HttpStatus.CONFLICT, description: 'FCM token already inactive' })
    @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid input data' })
    @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
    public async unregisterToken(
        @Body() input: UnregisterFcmTokenInput,
        @CurrentUser() user: User,
    ): Promise<FcmTokenDto> {
        const result = await this.fcmService.unregisterToken(user, input);
        this.logger.info(`User ${user.id} unregistered FCM token`);
        return result;
    }

    @Get('tokens')
    @ApiOperation({ summary: 'Get all active FCM tokens for current user' })
    @ApiResponse({ status: HttpStatus.OK, isArray: true, type: FcmTokenDto })
    @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
    public async getUserTokens(@CurrentUser() user: User): Promise<IResponse<FcmTokenDto[]>> {
        return this.fcmService.getUserTokens(user.id);
    }

    @Post('test-notification')
    @ApiOperation({ summary: 'Send test notification to current user devices' })
    @ApiResponse({ status: HttpStatus.OK, description: 'Test notification sent successfully' })
    @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid input data' })
    @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
    public async sendTestNotification(
        @Body() input: SendNotificationInput,
        @CurrentUser() user: User,
    ): Promise<{ message: string; successCount: number; failureCount: number }> {
        // Get user's active tokens
        const userTokens = await this.fcmService.getUserTokens(user.id);

        if (userTokens.items.length === 0) {
            return {
                message: 'No active FCM tokens found for user',
                successCount: 0,
                failureCount: 0,
            };
        }

        const tokens = userTokens.items.map((token) => token.fcmToken);

        // Send notification to all user devices
        const response = await this.firebaseService.sendToMultipleDevices(
            tokens,
            {
                title: input.title,
                body: input.body,
                data: input.data,
                imageUrl: input.imageUrl,
            },
            {
                priority: input.priority,
            },
        );

        this.logger.info(
            `Test notification sent to user ${user.id}: ${response.successCount} success, ${response.failureCount} failed`,
        );

        return {
            message: 'Test notification sent',
            successCount: response.successCount,
            failureCount: response.failureCount,
        };
    }
}
