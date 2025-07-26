import {
    Body,
    Controller,
    Delete,
    Get,
    HttpStatus,
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
        private readonly logger: LoggerService,
        private readonly userService: UserService,
    ) {}

    @Get()
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.STAFF])
    @ApiOperation({ summary: 'Find users' })
    @ApiResponse({ status: HttpStatus.OK, isArray: true, type: UserDto })
    public async find(): Promise<UserDto[]> {
        return this.userService.find();
    }

    @Get(':id')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.STAFF])
    @ApiOperation({ summary: 'Find user by ID' })
    @ApiResponse({ status: HttpStatus.OK, type: UserDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'User not found' })
    public async findOne(@Param('id') id: string): Promise<UserDto> {
        return this.userService.findOne(id);
    }

    @Post()
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN])
    @UseGuards(RestrictedGuard)
    @ApiOperation({ summary: 'Create user' })
    @ApiResponse({ status: HttpStatus.CREATED, type: UserDto })
    public async create(@Body(UserPipe) input: UserInput): Promise<UserDto> {
        const user = await this.userService.create(input);
        this.logger.info(`Created new user with ID ${user.id}`);

        return user;
    }

    @Put()
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN])
    @UseGuards(RestrictedGuard)
    @ApiOperation({ summary: 'Update user' })
    @ApiResponse({ status: HttpStatus.OK, type: UserDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'User not found' })
    public async update(@Body(UserPipe) updateUserData: UserInput): Promise<UserDto> {
        const user = await this.userService.update(updateUserData);
        this.logger.info(`Updated user with ID ${updateUserData.id}`);

        return user;
    }

    @Delete(':id')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN])
    @ApiOperation({ summary: 'Delete user' })
    @ApiResponse({ status: HttpStatus.OK, type: UserDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'User not found' })
    public async delete(@Param('id') id: string): Promise<UserDto> {
        const user = await this.userService.delete(id);
        this.logger.info(`Deleted user with ID ${id}`);

        return user;
    }
}
