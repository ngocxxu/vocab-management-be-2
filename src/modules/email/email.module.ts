import { Module } from '@nestjs/common';

import { CommonModule } from '../common';
import { EmailProcessor } from './processor/email.processor';
import { EmailService } from './service';

@Module({
    imports: [
        CommonModule,
    ],
    providers: [
        EmailService,
        EmailProcessor
    ],
    exports: []
})
export class EmailModule { }
