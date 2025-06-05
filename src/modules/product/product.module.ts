import { Module } from '@nestjs/common';

import { CommonModule } from '../common';
import { ProductController } from './controller';
import { ProductService } from './service';

@Module({
    imports: [
        CommonModule,
    ],
    providers: [
        ProductService
    ],
    controllers: [
        ProductController
    ],
    exports: []
})
export class ProductModule { }
