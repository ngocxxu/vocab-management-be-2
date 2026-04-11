import { LoggerService, RolesGuard } from '@/shared';
import { Roles } from '@/shared/decorators';
import { CurrentUser } from '@/shared/decorators/user.decorator';
import { Controller, Get, HttpStatus, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { User, UserRole } from '@prisma/client';
import { GenerateUploadSignatureInput, GenerateUploadSignatureOutput } from '../dto';
import { CloudinaryService } from '../services/cloudinary.service';

@Controller('cloudinary')
@ApiTags('cloudinary')
@ApiBearerAuth()
export class CloudinaryController {
    public constructor(
        private readonly logger: LoggerService,
        private readonly cloudinaryService: CloudinaryService,
    ) {}

    @Get('upload-signature')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN, UserRole.MEMBER])
    @ApiOperation({ summary: 'Generate Cloudinary upload signature' })
    @ApiResponse({
        status: HttpStatus.OK,
        type: GenerateUploadSignatureOutput,
        description: 'Returns signature and parameters for direct Cloudinary upload',
    })
    @ApiResponse({
        status: HttpStatus.BAD_REQUEST,
        description: 'Invalid parameters provided',
    })
    public generateUploadSignature(@Query() input: GenerateUploadSignatureInput, @CurrentUser() user: User): GenerateUploadSignatureOutput {
        this.logger.info(`User ${user.id} requested Cloudinary upload signature`);
        return this.cloudinaryService.generateUploadSignature(input);
    }
}
