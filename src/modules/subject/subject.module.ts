import { Module } from '@nestjs/common';
import { CommonModule } from '../common';
import { SubjectController } from './controller';
import { SubjectService } from './service';

@Module({
    imports: [CommonModule],
    controllers: [SubjectController],
    providers: [SubjectService],
    exports: [SubjectService],
})
export class SubjectModule {}
