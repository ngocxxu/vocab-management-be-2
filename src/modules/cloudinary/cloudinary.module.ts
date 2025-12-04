import { Module } from '@nestjs/common';
import { CommonModule } from '../common';
import { CloudinaryController } from './controller/cloudinary.controller';
import { CloudinaryService } from './service/cloudinary.service';

@Module({
    imports: [CommonModule],
    controllers: [CloudinaryController],
    providers: [CloudinaryService],
    exports: [CloudinaryService],
})
export class CloudinaryModule {}


