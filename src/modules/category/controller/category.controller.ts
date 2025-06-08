import {
    Body,
    Controller,
    Delete,
    Get,
    HttpStatus,
    Inject,
    Param,
    ParseIntPipe,
    Post,
    Put,
    UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { LoggerService, RestrictedGuard } from '../../common';
import { Service } from '../../tokens';

import { CategoryPipe } from '../flow';
import { CategoryDto, CategoryInput } from '../model';
import { CategoryService } from '../service';

@Controller('categorys')
@ApiTags('category')
@ApiBearerAuth()
export class CategoryController {
    public constructor(
        @Inject(Service.CONFIG)
        private readonly logger: LoggerService,
        private readonly categoryService: CategoryService,
    ) {}

    @Get()
    @ApiOperation({ summary: 'Find categorys' })
    @ApiResponse({ status: HttpStatus.OK, isArray: true, type: CategoryDto })
    public async find(): Promise<CategoryDto[]> {
        return this.categoryService.find();
    }

    @Get(':id')
    @ApiOperation({ summary: 'Find category by ID' })
    @ApiResponse({ status: HttpStatus.OK, type: CategoryDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Category not found' })
    public async findOne(@Param('id', ParseIntPipe) id: number): Promise<CategoryDto> {
        return this.categoryService.findOne(id);
    }

    @Post()
    @UseGuards(RestrictedGuard)
    @ApiOperation({ summary: 'Create category' })
    @ApiResponse({ status: HttpStatus.CREATED, type: CategoryDto })
    public async create(@Body(CategoryPipe) input: CategoryInput): Promise<CategoryDto> {
        const category = await this.categoryService.create(input);
        this.logger.info(`Created new category with ID ${category.id}`);

        return category;
    }

    @Put(':id')
    @UseGuards(RestrictedGuard)
    @ApiOperation({ summary: 'Update category' })
    @ApiResponse({ status: HttpStatus.OK, type: CategoryDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Category not found' })
    public async update(
        @Param('id', ParseIntPipe) id: number,
        @Body(CategoryPipe) input: CategoryInput,
    ): Promise<CategoryDto> {
        const category = await this.categoryService.update(id, input);
        this.logger.info(`Updated category with ID ${id}`);

        return category;
    }

    @Delete(':id')
    @UseGuards(RestrictedGuard)
    @ApiOperation({ summary: 'Delete category' })
    @ApiResponse({ status: HttpStatus.OK, type: CategoryDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Category not found' })
    public async delete(@Param('id', ParseIntPipe) id: number): Promise<CategoryDto> {
        const category = await this.categoryService.delete(id);
        this.logger.info(`Deleted category with ID ${id}`);

        return category;
    }
}
