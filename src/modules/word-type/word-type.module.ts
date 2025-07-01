import { Module } from '@nestjs/common';
import { CommonModule } from '../common';
import { WordTypeController } from './controller';
import { WordTypeService } from './service';

@Module({
    imports: [CommonModule],
    controllers: [WordTypeController],
    providers: [WordTypeService],
    exports: [WordTypeService],
})
export class WordTypeModule {}
