import { Injectable, PipeTransform } from '@nestjs/common';
import { LanguageFolderInput } from '../model';

@Injectable()
export class LanguageFolderPipe implements PipeTransform<LanguageFolderInput, LanguageFolderInput> {
    transform(value: LanguageFolderInput): LanguageFolderInput {
        // Basic validation and sanitization
        return {
            name: value.name?.trim() || value.name,
            folderColor: value.folderColor?.trim() || value.folderColor,
            sourceLanguageCode:
                value.sourceLanguageCode?.trim().toLowerCase() || value.sourceLanguageCode,
            targetLanguageCode:
                value.targetLanguageCode?.trim().toLowerCase() || value.targetLanguageCode,
        };
    }
}
