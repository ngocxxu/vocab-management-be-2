import { Module } from '@nestjs/common';
import { CommonModule } from '../common';
import { ConfigController } from './controller/config.controller';
import { ConfigRepository } from './repository';
import { ConfigService } from './service/config.service';

@Module({
    imports: [CommonModule],
    controllers: [ConfigController],
    providers: [ConfigRepository, ConfigService],
    exports: [ConfigService],
})
export class ConfigModule {}

