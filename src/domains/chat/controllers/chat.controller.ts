import type { AuthUser } from '@/auth';
import { CurrentUser, Roles, RolesGuard } from '@/auth';
import { Controller, Delete, Get, HttpCode, HttpStatus, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { QueryMessagesDto } from '../dto';
import { ChatService } from '../services';

@Controller('chat')
@ApiTags('chat')
@ApiBearerAuth()
export class ChatController {
    public constructor(private readonly chatService: ChatService) {}

    @Get('messages')
    @HttpCode(HttpStatus.OK)
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER, UserRole.GUEST])
    @ApiOperation({ summary: 'Get paginated chat history' })
    @ApiResponse({ status: HttpStatus.OK, description: 'Chat messages returned' })
    public async getMessages(@CurrentUser() user: AuthUser, @Query() query: QueryMessagesDto) {
        return this.chatService.getHistory(user.id, query.cursor, query.limit);
    }

    @Get('unread-count')
    @HttpCode(HttpStatus.OK)
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER, UserRole.GUEST])
    @ApiOperation({ summary: 'Get count of unread assistant messages since last read' })
    @ApiResponse({ status: HttpStatus.OK, description: 'Unread count returned' })
    public async getUnreadCount(@CurrentUser() user: AuthUser): Promise<{ unreadCount: number }> {
        return this.chatService.getUnreadCount(user.id);
    }

    @Patch('read')
    @HttpCode(HttpStatus.NO_CONTENT)
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER, UserRole.GUEST])
    @ApiOperation({ summary: 'Mark all chat messages as read' })
    @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Marked as read' })
    public async markAsRead(@CurrentUser() user: AuthUser): Promise<void> {
        await this.chatService.markAsRead(user.id);
    }

    @Delete('history')
    @HttpCode(HttpStatus.NO_CONTENT)
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER, UserRole.GUEST])
    @ApiOperation({ summary: 'Delete all chat history and cancel pending jobs' })
    @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'History deleted' })
    public async deleteHistory(@CurrentUser() user: AuthUser): Promise<void> {
        await this.chatService.deleteHistory(user.id);
    }
}
