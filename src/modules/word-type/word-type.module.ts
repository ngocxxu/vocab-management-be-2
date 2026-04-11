import { Module } from '@nestjs/common';
import { WordTypeController } from './controllers';
import { WordTypeRepository } from './repositories';
import { WordTypeService } from './services';

@Module({
    imports: [],
    controllers: [WordTypeController],
    providers: [WordTypeRepository, WordTypeService],
    exports: [WordTypeService, WordTypeRepository],
})
export class WordTypeModule {}
