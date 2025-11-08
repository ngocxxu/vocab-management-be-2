import { Module } from '@nestjs/common';
import { CommonModule } from '../common';
import { ConfigController } from './controller/config.controller';
import { ConfigService } from './service/config.service';

@Module({
    imports: [CommonModule],
    controllers: [ConfigController],
    providers: [ConfigService],
    exports: [ConfigService],
})
export class ConfigModule {}

