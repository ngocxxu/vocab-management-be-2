import { Module } from '@nestjs/common';

import { CommonModule } from '../common';
import { EmailService } from './service';

@Module({
    imports: [
        CommonModule,
    ],
    providers: [
        EmailService
    ],
    exports: []
})
export class EmailModule { }
