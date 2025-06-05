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
import { CategoryData, CategoryInput } from '../model';
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
    @ApiResponse({ status: HttpStatus.OK, isArray: true, type: CategoryData })
    public async find(): Promise<CategoryData[]> {
        return this.categoryService.find();
    }

    @Get(':id')
    @ApiOperation({ summary: 'Find category by ID' })
    @ApiResponse({ status: HttpStatus.OK, type: CategoryData })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Category not found' })
    public async findOne(@Param('id', ParseIntPipe) id: number): Promise<CategoryData> {
        return this.categoryService.findOne(id);
    }

    @Post()
    @UseGuards(RestrictedGuard)
    @ApiOperation({ summary: 'Create category' })
    @ApiResponse({ status: HttpStatus.CREATED, type: CategoryData })
    public async create(@Body(CategoryPipe) input: CategoryInput): Promise<CategoryData> {
        const category = await this.categoryService.create(input);
        this.logger.info(`Created new category with ID ${category.id}`);

        return category;
    }

    @Put(':id')
    @UseGuards(RestrictedGuard)
    @ApiOperation({ summary: 'Update category' })
    @ApiResponse({ status: HttpStatus.OK, type: CategoryData })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Category not found' })
    public async update(
        @Param('id', ParseIntPipe) id: number,
        @Body(CategoryPipe) input: CategoryInput,
    ): Promise<CategoryData> {
        const category = await this.categoryService.update(id, input);
        this.logger.info(`Updated category with ID ${id}`);

        return category;
    }

    @Delete(':id')
    @UseGuards(RestrictedGuard)
    @ApiOperation({ summary: 'Delete category' })
    @ApiResponse({ status: HttpStatus.OK, type: CategoryData })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Category not found' })
    public async delete(@Param('id', ParseIntPipe) id: number): Promise<CategoryData> {
        const category = await this.categoryService.delete(id);
        this.logger.info(`Deleted category with ID ${id}`);

        return category;
    }
}
