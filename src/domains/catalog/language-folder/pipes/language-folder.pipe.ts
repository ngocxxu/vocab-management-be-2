import { Injectable, PipeTransform } from '@nestjs/common';
import { LanguageFolderInput } from '../dto';

@Injectable()
export class LanguageFolderPipe implements PipeTransform<LanguageFolderInput, LanguageFolderInput> {
    public transform(value: LanguageFolderInput): LanguageFolderInput {
        // Basic validation and sanitization
        return {
            name: value.name?.trim() || value.name,
            folderColor: value.folderColor?.trim() || value.folderColor,
            sourceLanguageCode: value.sourceLanguageCode?.trim() || value.sourceLanguageCode,
            targetLanguageCode: value.targetLanguageCode?.trim() || value.targetLanguageCode,
        };
    }
}
