import {
    Body,
    Controller,
    Delete,
    Get,
    HttpStatus,
    Param,
    Patch,
    Post,
    Put,
    Query,
    UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { LoggerService, RolesGuard } from '../../common';
import { Roles } from '../../common/decorator/roles.decorator';
import {
    NotificationDto,
    NotificationInput,
    UpdateNotificationInput,
    UpdateNotificationStatusInput,
} from '../model';
import { NotificationService } from '../service';

@Controller('notifications')
@ApiTags('notification')
@ApiBearerAuth()
export class NotificationController {
    public constructor(
        private readonly logger: LoggerService,
        private readonly notificationService: NotificationService,
    ) {}

    @Get()
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.STAFF])
    @ApiOperation({ summary: 'Find all notifications (Admin only)' })
    @ApiResponse({ status: HttpStatus.OK, isArray: true, type: NotificationDto })
    public async find(): Promise<NotificationDto[]> {
        return this.notificationService.find();
    }

    @Get('my')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.STAFF, UserRole.CUSTOMER])
    @ApiOperation({ summary: 'Get current user notifications' })
    @ApiQuery({ name: 'includeDeleted', required: false, type: Boolean })
    @ApiResponse({ status: HttpStatus.OK, isArray: true, type: NotificationDto })
    public async getMyNotifications(
        @Param('id') userId: string,
        @Query('includeDeleted') includeDeleted?: boolean,
    ): Promise<NotificationDto[]> {
        return this.notificationService.findByUser(userId, includeDeleted === true);
    }

    @Get('my/unread-count')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.STAFF, UserRole.CUSTOMER])
    @ApiOperation({ summary: 'Get unread notification count for current user' })
    @ApiResponse({
        status: HttpStatus.OK,
        schema: {
            type: 'object',
            properties: { count: { type: 'number' } },
        },
    })
    public async getUnreadCount(@Param('id') userId: string): Promise<{ count: number }> {
        const count = await this.notificationService.getUnreadCount(userId);
        return { count };
    }

    @Get(':id')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.STAFF, UserRole.CUSTOMER])
    @ApiOperation({ summary: 'Find notification by ID' })
    @ApiResponse({ status: HttpStatus.OK, type: NotificationDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Notification not found' })
    public async findOne(@Param('id') id: string): Promise<NotificationDto> {
        return this.notificationService.findOne(id);
    }

    @Post()
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.STAFF])
    @ApiOperation({ summary: 'Create notification' })
    @ApiResponse({ status: HttpStatus.CREATED, type: NotificationDto })
    public async create(@Body() input: NotificationInput): Promise<NotificationDto> {
        const notification = await this.notificationService.create(input);
        this.logger.info(`Created new notification with ID ${notification.id}`);
        return notification;
    }

    @Put(':id')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.STAFF])
    @ApiOperation({ summary: 'Update notification' })
    @ApiResponse({ status: HttpStatus.OK, type: NotificationDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Notification not found' })
    public async update(
        @Param('id') id: string,
        @Body() updateNotificationData: UpdateNotificationInput,
    ): Promise<NotificationDto> {
        const notification = await this.notificationService.update(id, updateNotificationData);
        this.logger.info(`Updated notification with ID ${id}`);
        return notification;
    }

    @Patch(':id/status')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.STAFF, UserRole.CUSTOMER])
    @ApiOperation({ summary: 'Update notification status for current user' })
    @ApiResponse({ status: HttpStatus.OK, type: NotificationDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Notification not found' })
    @ApiResponse({
        status: HttpStatus.FORBIDDEN,
        description: 'User is not a recipient of this notification',
    })
    public async updateStatus(
        @Param('id') notificationId: string,
        @Param('id') userId: string,
        @Body() updateData: UpdateNotificationStatusInput,
    ): Promise<NotificationDto> {
        const notification = await this.notificationService.updateUserStatus(
            notificationId,
            userId,
            updateData,
        );
        this.logger.info(
            `Updated notification status for notification ${notificationId} and user ${userId}`,
        );
        return notification;
    }

    @Patch('my/mark-all-read')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.STAFF, UserRole.CUSTOMER])
    @ApiOperation({ summary: 'Mark all notifications as read for current user' })
    @ApiResponse({
        status: HttpStatus.OK,
        schema: {
            type: 'object',
            properties: {
                count: { type: 'number', description: 'Number of notifications marked as read' },
            },
        },
    })
    public async markAllAsRead(@Param('id') userId: string): Promise<{ count: number }> {
        const count = await this.notificationService.markAllAsRead(userId);
        this.logger.info(`Marked ${count} notifications as read for user ${userId}`);
        return { count };
    }

    @Delete(':id')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.STAFF])
    @ApiOperation({ summary: 'Delete notification (Admin only)' })
    @ApiResponse({ status: HttpStatus.OK, type: NotificationDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Notification not found' })
    public async delete(@Param('id') id: string): Promise<NotificationDto> {
        const notification = await this.notificationService.delete(id);
        this.logger.info(`Deleted notification with ID ${id}`);
        return notification;
    }

    @Delete('cleanup/expired')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN])
    @ApiOperation({ summary: 'Clean up expired notifications (Admin only)' })
    @ApiResponse({
        status: HttpStatus.OK,
        schema: {
            type: 'object',
            properties: {
                count: { type: 'number', description: 'Number of notifications cleaned up' },
            },
        },
    })
    public async cleanupExpired(): Promise<{ count: number }> {
        const count = await this.notificationService.cleanupExpired();
        this.logger.info(`Cleaned up ${count} expired notifications`);
        return { count };
    }
}
