import { Module } from '@nestjs/common';

import { CategoryModule } from './category/category.module';
import { CommonModule } from './common';
import { PassengerModule } from './passenger/passenger.module';
import { ProductModule } from './product/product.module';

@Module({
    imports: [CommonModule, PassengerModule, ProductModule, CategoryModule],
})
export class ApplicationModule {}
