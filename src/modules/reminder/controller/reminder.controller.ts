import { Controller, Post, Body, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { LoggerService, RolesGuard } from '../../common';
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
    const { userEmail, reminderType, templateName, data } = body;

    await this.reminderService.sendImmediateReminder(userEmail, reminderType, templateName, data);

    this.logger.info(`Immediate reminder sent to ${userEmail} with reminder type: ${reminderType}`);

    return { message: 'Immediate reminder sent' };
  }

  @Post('schedule')
  @UseGuards(RolesGuard)
  @Roles([UserRole.ADMIN, UserRole.STAFF])
  @ApiOperation({ summary: 'Schedule reminder' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Reminder scheduled successfully' })
  public async scheduleReminder(@Body() body: ScheduleReminderInput) {
    const { userEmail, reminderType, templateName, data, scheduleTime } = body;

    const delayInMs = new Date(scheduleTime).getTime() - Date.now();

    await this.reminderService.scheduleReminder(
      userEmail,
      reminderType,
      templateName,
      data,
      delayInMs
    );

    this.logger.info(`Reminder scheduled successfully for ${userEmail} with reminder type: ${reminderType}`);

    return { message: 'Reminder scheduled successfully' };
  }

  @Post('recurring')
  @UseGuards(RolesGuard)
  @Roles([UserRole.ADMIN, UserRole.STAFF])
  @ApiOperation({ summary: 'Schedule recurring reminder' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Recurring reminder scheduled' })
  public async scheduleRecurringReminder(@Body() body: RecurringReminderInput) {
    const { userEmail, reminderType, templateName, data, cronPattern } = body;

    await this.reminderService.scheduleRecurringReminder(
      userEmail,
      reminderType,
      templateName,
      data,
      cronPattern
    );

    this.logger.info(`Recurring reminder scheduled for ${userEmail} with reminder type: ${reminderType}`);

    return { message: 'Recurring reminder scheduled' };
  }
}