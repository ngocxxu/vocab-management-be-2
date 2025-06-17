import { Module } from '@nestjs/common';

import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { CategoryModule } from './category/category.module';
import { AuthGuard, CommonModule } from './common';
import { PassengerModule } from './passenger/passenger.module';
import { ProductModule } from './product/product.module';
import { UserModule } from './user/user.module';

@Module({
    imports: [CommonModule, PassengerModule, ProductModule, CategoryModule, AuthModule, UserModule],
    providers: [
        {
            provide: APP_GUARD,
            useClass: AuthGuard,
        },
    ],
})
export class ApplicationModule {}
