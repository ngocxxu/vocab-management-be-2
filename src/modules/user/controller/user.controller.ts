import {
    Body,
    Controller,
    Delete,
    Get,
    HttpStatus,
    Inject,
    Param,
    Post,
    Put,
    UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { UserRole } from '@prisma/client';
import { LoggerService, RestrictedGuard, RolesGuard } from '../../common';

import { Roles } from '../../common/decorator/roles.decorator';
import { UserPipe } from '../flow';
import { UserDto, UserInput } from '../model';
import { UserService } from '../service';

@Controller('users')
@ApiTags('user')
@ApiBearerAuth()
export class UserController {
    public constructor(
        @Inject()
        private readonly logger: LoggerService,
        private readonly userService: UserService,
    ) {}

    @Get()
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN])
    @ApiOperation({ summary: 'Find users' })
    @ApiResponse({ status: HttpStatus.OK, isArray: true, type: UserDto })
    public async find(): Promise<UserDto[]> {
        return this.userService.find();
    }

    @Get(':supabaseUserId')
    @ApiOperation({ summary: 'Find user by ID' })
    @ApiResponse({ status: HttpStatus.OK, type: UserDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'User not found' })
    public async findOne(@Param('supabaseUserId') supabaseUserId: string): Promise<UserDto> {
        return this.userService.findOne(supabaseUserId);
    }

    @Post()
    @UseGuards(RestrictedGuard)
    @ApiOperation({ summary: 'Create user' })
    @ApiResponse({ status: HttpStatus.CREATED, type: UserDto })
    public async create(@Body(UserPipe) input: UserInput): Promise<UserDto> {
        const user = await this.userService.create(input);
        this.logger.info(`Created new user with ID ${user.id}`);

        return user;
    }

    @Put()
    @UseGuards(RestrictedGuard)
    @ApiOperation({ summary: 'Update user' })
    @ApiResponse({ status: HttpStatus.OK, type: UserDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'User not found' })
    public async update(@Body(UserPipe) updateUserData: UserInput): Promise<UserDto> {
        const user = await this.userService.update(updateUserData);
        this.logger.info(`Updated user with ID ${updateUserData.supabaseUserId}`);

        return user;
    }

    @Delete(':supabaseUserId')
    // @UseGuards(RestrictedGuard)
    @ApiOperation({ summary: 'Delete user' })
    @ApiResponse({ status: HttpStatus.OK, type: UserDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'User not found' })
    public async delete(@Param('supabaseUserId') supabaseUserId: string): Promise<UserDto> {
        const user = await this.userService.delete(supabaseUserId);
        this.logger.info(`Deleted user with ID ${supabaseUserId}`);

        return user;
    }
}
