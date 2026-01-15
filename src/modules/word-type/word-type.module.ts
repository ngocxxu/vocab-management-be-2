import { Module } from '@nestjs/common';
import { CommonModule } from '../common';
import { WordTypeController } from './controller';
import { WordTypeRepository } from './repository';
import { WordTypeService } from './service';

@Module({
    imports: [CommonModule],
    controllers: [WordTypeController],
    providers: [WordTypeRepository, WordTypeService],
    exports: [WordTypeService, WordTypeRepository],
})
export class WordTypeModule {}
