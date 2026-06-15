import { RolesGuard } from '@/shared';
import { CurrentUser, Roles } from '@/shared/decorators';
import { PaginationDto } from '@/shared/dto/pagination.dto';
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { User, UserRole } from '@prisma/client';
import { TextTargetDto } from '../dto';
import { CreateTextTargetStandaloneInput } from '../dto/create-text-target-standalone.input';
import { TextTargetQueryParamsInput } from '../dto/text-target-query-params.input';
import { UpdateTextTargetInput } from '../dto/update-text-target.input';
import { VocabTextTargetService } from '../services/vocab-text-target.service';

@Controller('vocabs/:vocabId/text-targets')
@ApiTags('text-target')
@ApiBearerAuth()
export class TextTargetController {
    public constructor(private readonly vocabTextTargetService: VocabTextTargetService) {}

    @Get()
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER, UserRole.GUEST])
    @ApiOperation({ summary: 'Get paginated text targets for a vocab' })
    @ApiParam({ name: 'vocabId', type: String, description: 'Vocab identifier' })
    @ApiResponse({ status: HttpStatus.OK, type: PaginationDto, description: 'Paginated text targets' })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Vocab not found' })
    @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid bearer token' })
    @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'User role is not allowed to access this resource' })
    public async findAll(@Param('vocabId') vocabId: string, @Query() query: TextTargetQueryParamsInput, @CurrentUser() user: User): Promise<PaginationDto<TextTargetDto>> {
        return this.vocabTextTargetService.findAll(vocabId, user.id, query);
    }

    @Get(':id')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER, UserRole.GUEST])
    @ApiOperation({ summary: 'Get a single text target by ID' })
    @ApiParam({ name: 'vocabId', type: String, description: 'Vocab identifier' })
    @ApiParam({ name: 'id', type: String, description: 'TextTarget identifier' })
    @ApiResponse({ status: HttpStatus.OK, type: TextTargetDto, description: 'Text target details' })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Vocab or text target not found' })
    @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid bearer token' })
    @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'User role is not allowed to access this resource' })
    public async findOne(@Param('vocabId') vocabId: string, @Param('id') id: string, @CurrentUser() user: User): Promise<TextTargetDto> {
        return this.vocabTextTargetService.findOne(vocabId, id, user.id);
    }

    @Post()
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER, UserRole.GUEST])
    @ApiOperation({ summary: 'Create a new text target for a vocab' })
    @ApiParam({ name: 'vocabId', type: String, description: 'Vocab identifier' })
    @ApiResponse({ status: HttpStatus.CREATED, type: TextTargetDto, description: 'Text target created' })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Vocab not found' })
    @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Text target with this value already exists for vocab' })
    @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid bearer token' })
    @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'User role is not allowed to access this resource' })
    public async create(@Param('vocabId') vocabId: string, @Body() input: CreateTextTargetStandaloneInput, @CurrentUser() user: User): Promise<TextTargetDto> {
        return this.vocabTextTargetService.create(vocabId, user.id, input);
    }

    @Put(':id')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER, UserRole.GUEST])
    @ApiOperation({ summary: 'Update a text target' })
    @ApiParam({ name: 'vocabId', type: String, description: 'Vocab identifier' })
    @ApiParam({ name: 'id', type: String, description: 'TextTarget identifier' })
    @ApiResponse({ status: HttpStatus.OK, type: TextTargetDto, description: 'Text target updated' })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Vocab or text target not found' })
    @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid bearer token' })
    @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'User role is not allowed to access this resource' })
    public async update(@Param('vocabId') vocabId: string, @Param('id') id: string, @Body() input: UpdateTextTargetInput, @CurrentUser() user: User): Promise<TextTargetDto> {
        return this.vocabTextTargetService.update(vocabId, id, user.id, input);
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER, UserRole.GUEST])
    @ApiOperation({ summary: 'Delete a text target' })
    @ApiParam({ name: 'vocabId', type: String, description: 'Vocab identifier' })
    @ApiParam({ name: 'id', type: String, description: 'TextTarget identifier' })
    @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Text target deleted' })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Vocab or text target not found' })
    @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid bearer token' })
    @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'User role is not allowed to access this resource' })
    public async remove(@Param('vocabId') vocabId: string, @Param('id') id: string, @CurrentUser() user: User): Promise<void> {
        await this.vocabTextTargetService.remove(vocabId, id, user.id);
    }
}
