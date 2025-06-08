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

import { ProductPipe } from '../flow';
import { ProductDto, ProductInput } from '../model';
import { ProductService } from '../service';

@Controller('products')
@ApiTags('product')
@ApiBearerAuth()
export class ProductController {
    public constructor(
        @Inject(Service.CONFIG)
        private readonly logger: LoggerService,
        private readonly productService: ProductService,
    ) {}

    @Get()
    @ApiOperation({ summary: 'Find products' })
    @ApiResponse({ status: HttpStatus.OK, isArray: true, type: ProductDto })
    public async find(): Promise<ProductDto[]> {
        return this.productService.find();
    }

    @Get(':id')
    @ApiOperation({ summary: 'Find product by ID' })
    @ApiResponse({ status: HttpStatus.OK, type: ProductDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Product not found' })
    public async findOne(@Param('id', ParseIntPipe) id: number): Promise<ProductDto> {
        return this.productService.findOne(id);
    }

    @Post()
    @UseGuards(RestrictedGuard)
    @ApiOperation({ summary: 'Create product' })
    @ApiResponse({ status: HttpStatus.CREATED, type: ProductDto })
    public async create(@Body(ProductPipe) input: ProductInput): Promise<ProductDto> {
        const product = await this.productService.create(input);
        this.logger.info(`Created new product with ID ${product.id}`);

        return product;
    }

    @Put(':id')
    @UseGuards(RestrictedGuard)
    @ApiOperation({ summary: 'Update product' })
    @ApiResponse({ status: HttpStatus.OK, type: ProductDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Product not found' })
    public async update(
        @Param('id', ParseIntPipe) id: number,
        @Body(ProductPipe) input: ProductInput,
    ): Promise<ProductDto> {
        const product = await this.productService.update(id, input);
        this.logger.info(`Updated product with ID ${id}`);

        return product;
    }

    @Delete(':id')
    @UseGuards(RestrictedGuard)
    @ApiOperation({ summary: 'Delete product' })
    @ApiResponse({ status: HttpStatus.OK, type: ProductDto })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Product not found' })
    public async delete(@Param('id', ParseIntPipe) id: number): Promise<ProductDto> {
        const product = await this.productService.delete(id);
        this.logger.info(`Deleted product with ID ${id}`);

        return product;
    }
}
