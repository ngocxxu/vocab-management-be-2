import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { CloudinaryResourceType } from './cloudinary-resource-type.enum';

export class GenerateUploadSignatureInput {
    @ApiProperty({
        description: 'Folder path in Cloudinary',
        example: 'vocab/audio',
        required: false,
        default: 'vocab/audio',
    })
    @IsOptional()
    @IsString()
    public folder?: string;

    @ApiProperty({
        description: 'Resource type for upload',
        enum: CloudinaryResourceType,
        example: CloudinaryResourceType.AUDIO,
        required: false,
        default: CloudinaryResourceType.AUDIO,
    })
    @IsOptional()
    @IsEnum(CloudinaryResourceType)
    public resourceType?: CloudinaryResourceType;

    @ApiProperty({
        description: 'Maximum file size in bytes',
        example: 10485760,
        required: false,
        default: 10485760,
    })
    @IsOptional()
    @IsNumber()
    @Min(1048576)
    @Max(104857600)
    public maxFileSize?: number;

    @ApiProperty({
        description: 'Upload preset name',
        example: 'vocab',
        required: false,
    })
    @IsOptional()
    @IsString()
    public uploadPreset?: string;
}




