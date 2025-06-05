import { Module } from '@nestjs/common';

import { CommonModule } from '../common';
import { CategoryController } from './controller';
import { CategoryService } from './service';

@Module({
    imports: [
        CommonModule,
    ],
    providers: [
        CategoryService
    ],
    controllers: [
        CategoryController
    ],
    exports: []
})
export class CategoryModule { }
