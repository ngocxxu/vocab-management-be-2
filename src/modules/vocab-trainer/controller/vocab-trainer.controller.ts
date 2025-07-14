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
import { LoggerService, RolesGuard } from '../../common';
import { Roles } from '../../common/decorator/roles.decorator';
import { VocabTrainerDto, VocabTrainerInput } from '../model';
import { UpdateVocabTrainerInput } from '../model/update-vocab-trainer.input';
import { VocabTrainerService } from '../service';

@Controller('vocab-trainers')
@ApiTags('vocab-trainer')
@ApiBearerAuth()
export class VocabTrainerController {
    public constructor(
        private readonly logger: LoggerService,
        private readonly vocabTrainerService: VocabTrainerService,
    ) {}

    @Get()
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.STAFF])
    @ApiOperation({ summary: 'Find all vocab trainers' })
    @ApiResponse({ status: HttpStatus.OK, isArray: true, type: VocabTrainerDto })
    public async find(): Promise<VocabTrainerDto[]> {
        return this.vocabTrainerService.find();
    }

    @Get(':id')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.STAFF])
    @ApiOperation({ summary: 'Find vocab trainer by ID' })
    @ApiResponse({ status: HttpStatus.OK, type: VocabTrainerDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Vocab trainer not found' })
    public async findOne(@Param('id') id: string): Promise<VocabTrainerDto> {
        return this.vocabTrainerService.findOne(id);
    };

    @Get(':id/exam')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.STAFF])
    @ApiOperation({ summary: 'Find vocab trainer by ID and exam' })
    @ApiResponse({ status: HttpStatus.OK, type: VocabTrainerDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Exam of vocab trainer not found' })
    public async findOneAndExam(@Param('id') id: string): Promise<VocabTrainerDto> {
        return this.vocabTrainerService.findOneAndExam(id);
    }

    @Post()
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.STAFF])
    @ApiOperation({ summary: 'Create vocab trainer' })
    @ApiResponse({ status: HttpStatus.CREATED, type: VocabTrainerDto })
    public async create(@Body() input: VocabTrainerInput): Promise<VocabTrainerDto> {
        const trainer = await this.vocabTrainerService.create(input);
        this.logger.info(`Created new vocab trainer with ID ${trainer.id}`);
        return trainer;
    }

    @Put(':id')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.STAFF])
    @ApiOperation({ summary: 'Update vocab trainer' })
    @ApiResponse({ status: HttpStatus.OK, type: VocabTrainerDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Vocab trainer not found' })
    public async update(
        @Param('id') id: string,
        @Body() updateTrainerData: UpdateVocabTrainerInput,
    ): Promise<VocabTrainerDto> {
        const trainer = await this.vocabTrainerService.update(id, updateTrainerData);
        this.logger.info(`Updated vocab trainer with ID ${id}`);
        return trainer;
    }

    @Delete(':id')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.STAFF])
    @ApiOperation({ summary: 'Delete vocab trainer' })
    @ApiResponse({ status: HttpStatus.OK, type: VocabTrainerDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Vocab trainer not found' })
    public async delete(@Param('id') id: string): Promise<VocabTrainerDto> {
        const trainer = await this.vocabTrainerService.delete(id);
        this.logger.info(`Deleted vocab trainer with ID ${id}`);
        return trainer;
    }
}