import { BadRequestException, Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import {
    CloudinaryResourceType,
    GenerateUploadSignatureInput,
    GenerateUploadSignatureOutput,
} from '../model';

@Injectable()
export class CloudinaryService {
    private readonly apiKey: string;
    private readonly apiSecret: string;
    private readonly cloudName: string;

    public constructor() {
        const cloudinaryUrl = process.env.CLOUDINARY_URL;
        if (!cloudinaryUrl) {
            throw new Error('CLOUDINARY_URL environment variable is required');
        }

        const urlMatch = cloudinaryUrl.match(/cloudinary:\/\/([^:]+):([^@]+)@(.+)/);
        if (!urlMatch) {
            throw new Error(
                'Invalid CLOUDINARY_URL format. Expected: cloudinary://api_key:api_secret@cloud_name',
            );
        }

        [, this.apiKey, this.apiSecret, this.cloudName] = urlMatch;
    }

    public generateUploadSignature(
        input: GenerateUploadSignatureInput,
    ): GenerateUploadSignatureOutput {
        const folder = input.folder ? this.validateAndNormalizeFolder(input.folder) : undefined;
        const resourceType = input.resourceType || CloudinaryResourceType.AUDIO;
        const maxFileSize = input.maxFileSize || 10 * 1024 * 1024;
        const uploadPreset = input.uploadPreset;

        if (maxFileSize) {
            this.validateMaxFileSize(maxFileSize);
        }

        const timestamp = Math.floor(Date.now() / 1000);

        const signatureParams: Record<string, string | number> = {
            timestamp,
        };

        if (uploadPreset) {
            signatureParams.upload_preset = uploadPreset;
        }

        if (folder) {
            signatureParams.folder = folder;
        }

        const paramsString = this.buildParamsString(signatureParams);
        const signature = this.createSignature(paramsString, this.apiSecret);

        const uploadUrlPath = this.getUploadUrlPath(resourceType);
        const uploadUrl = `https://api.cloudinary.com/v1_1/${this.cloudName}/${uploadUrlPath}/upload`;

        return {
            signature,
            timestamp,
            cloudName: this.cloudName,
            apiKey: this.apiKey,
            folder: folder || '',
            resourceType,
            maxFileSize,
            uploadUrl,
            uploadPreset: uploadPreset || undefined,
        };
    }

    private validateAndNormalizeFolder(folder: string): string {
        const normalized = folder.trim().replace(/^\/+|\/+$/g, '');

        if (!normalized) {
            throw new BadRequestException('Folder cannot be empty');
        }

        if (!/^[a-zA-Z0-9_\/-]+$/.test(normalized)) {
            throw new BadRequestException(
                'Folder can only contain letters, numbers, underscores, hyphens, and forward slashes',
            );
        }

        return normalized;
    }

    private validateMaxFileSize(maxFileSize: number): void {
        const minSize = 1024 * 1024;
        const maxSize = 100 * 1024 * 1024;

        if (maxFileSize < minSize || maxFileSize > maxSize) {
            throw new BadRequestException(
                `Max file size must be between ${minSize} bytes (1MB) and ${maxSize} bytes (100MB)`,
            );
        }
    }

    private buildParamsString(params: Record<string, string | number>): string {
        const sortedKeys = Object.keys(params).sort();
        const pairs = sortedKeys.map((key) => `${key}=${params[key]}`);
        return pairs.join('&');
    }

    private createSignature(paramsString: string, apiSecret: string): string {
        const stringToSign = `${paramsString}${apiSecret}`;
        return crypto.createHash('sha1').update(stringToSign).digest('hex');
    }

    private getUploadUrlPath(resourceType: CloudinaryResourceType): string {
        switch (resourceType) {
            case CloudinaryResourceType.AUDIO:
                return 'video';
            case CloudinaryResourceType.VIDEO:
                return 'video';
            case CloudinaryResourceType.IMAGE:
                return 'image';
            case CloudinaryResourceType.RAW:
                return 'raw';
            default:
                return 'raw';
        }
    }
}












