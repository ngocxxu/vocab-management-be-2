import { Module } from '@nestjs/common';

import { CommonModule } from './common';
import { PassengerModule } from './passenger/passenger.module';
import { ProductModule } from './product/product.module';

@Module({
    imports: [
        CommonModule,
        PassengerModule,
        ProductModule
    ]
})
export class ApplicationModule {}
