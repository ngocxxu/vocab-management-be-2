import { Controller, Post, Body, HttpStatus, UseGuards, LoggerService } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { RolesGuard } from '../../common';
import { Roles } from '../../common/decorator/roles.decorator';
import { RecurringReminderInput, ScheduleReminderInput, SendReminderInput } from '../model';
import { ReminderService } from '../service';

@Controller('reminders')
@ApiTags('reminder')
@ApiBearerAuth()
export class ReminderController {
  public constructor(
    private readonly logger: LoggerService,
    private readonly reminderService: ReminderService,
  ) {}

  @Post('immediate')
  @UseGuards(RolesGuard)
  @Roles([UserRole.ADMIN, UserRole.STAFF])
  @ApiOperation({ summary: 'Send immediate reminder' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Immediate reminder sent' })
  public async sendImmediateReminder(@Body() body: SendReminderInput) {
    const { userEmail, reminderType, data } = body;

    await this.reminderService.sendImmediateReminder(userEmail, reminderType, data);

    this.logger.log(`Immediate reminder sent to ${userEmail} with reminder type: ${reminderType}`);

    return { message: 'Immediate reminder sent' };
  }

  @Post('schedule')
  @UseGuards(RolesGuard)
  @Roles([UserRole.ADMIN, UserRole.STAFF])
  @ApiOperation({ summary: 'Schedule reminder' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Reminder scheduled successfully' })
  public async scheduleReminder(@Body() body: ScheduleReminderInput) {
    const { userEmail, reminderType, data, scheduleTime } = body;

    const delayInMs = new Date(scheduleTime).getTime() - Date.now();

    await this.reminderService.scheduleReminder(
      userEmail,
      reminderType,
      data,
      delayInMs
    );

    this.logger.log(`Reminder scheduled successfully for ${userEmail} with reminder type: ${reminderType}`);

    return { message: 'Reminder scheduled successfully' };
  }

  @Post('recurring')
  @UseGuards(RolesGuard)
  @Roles([UserRole.ADMIN, UserRole.STAFF])
  @ApiOperation({ summary: 'Schedule recurring reminder' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Recurring reminder scheduled' })
  public async scheduleRecurringReminder(@Body() body: RecurringReminderInput) {
    const { userEmail, reminderType, data, cronPattern } = body;

    await this.reminderService.scheduleRecurringReminder(
      userEmail,
      reminderType,
      data,
      cronPattern
    );

    this.logger.log(`Recurring reminder scheduled for ${userEmail} with reminder type: ${reminderType}`);

    return { message: 'Recurring reminder scheduled' };
  }
}