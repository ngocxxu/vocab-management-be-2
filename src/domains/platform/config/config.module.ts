import { Module } from '@nestjs/common';
import { ConfigController } from './controllers/config.controller';
import { ConfigRepository } from './repositories';
import { ConfigService } from './services/config.service';

@Module({
    imports: [],
    controllers: [ConfigController],
    providers: [ConfigRepository, ConfigService],
    exports: [ConfigService],
})
export class ConfigModule {}
