import { ApiProperty } from '@nestjs/swagger';

export class GenerateUploadSignatureOutput {
    @ApiProperty({ description: 'HMAC-SHA1 signature for Cloudinary upload' })
    public signature: string;

    @ApiProperty({ description: 'Unix timestamp used in signature' })
    public timestamp: number;

    @ApiProperty({ description: 'Cloudinary cloud name' })
    public cloudName: string;

    @ApiProperty({ description: 'Cloudinary API key' })
    public apiKey: string;

    @ApiProperty({ description: 'Folder path for upload', required: false })
    public folder?: string;

    @ApiProperty({ description: 'Resource type for upload' })
    public resourceType: string;

    @ApiProperty({ description: 'Maximum file size in bytes' })
    public maxFileSize: number;

    @ApiProperty({ description: 'Full Cloudinary upload URL' })
    public uploadUrl: string;

    @ApiProperty({ description: 'Upload preset name', required: false })
    public uploadPreset?: string;
}
