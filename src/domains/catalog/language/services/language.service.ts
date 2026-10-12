import { IResponse } from '@/shared';
import { HttpStatus, Injectable } from '@nestjs/common';
import { AdminLanguageDto, LanguageDto, LanguageInput } from '../dto';
import { LanguageCodeImmutableException, LanguageInUseException, LanguageNotFoundException } from '../exceptions';
import { LanguageMapper } from '../mappers';
import { LanguageRepository } from '../repositories';
import { countUsageForCode } from '../utils';

@Injectable()
export class LanguageService {
    private readonly languageMapper = new LanguageMapper();

    public constructor(private readonly languageRepository: LanguageRepository) {}

    public async find(): Promise<IResponse<LanguageDto[]>> {
        const languages = await this.languageRepository.findAll();

        return {
            items: this.languageMapper.toResponseList(languages),
            statusCode: HttpStatus.OK,
        };
    }

    public async findOne(id: string): Promise<LanguageDto> {
        const language = await this.languageRepository.findById(id);

        if (!language) {
            throw new LanguageNotFoundException(id);
        }

        return this.languageMapper.toResponse(language);
    }

    public async create(createLanguageData: LanguageInput): Promise<LanguageDto> {
        const language = await this.languageRepository.create(this.languageMapper.toCreateInput(createLanguageData));

        return this.languageMapper.toResponse(language);
    }

    /** The code is fixed once created: vocabs and folders point at it. Only the name can change. */
    public async update(id: string, updateLanguageData: Partial<LanguageInput>): Promise<LanguageDto> {
        const existing = await this.findOne(id);

        if (updateLanguageData.code !== undefined && updateLanguageData.code !== existing.code) {
            throw new LanguageCodeImmutableException(existing.code);
        }

        const language = await this.languageRepository.update(id, this.languageMapper.buildUpdateInput({ name: updateLanguageData.name }));

        return this.languageMapper.toResponse(language);
    }

    public async delete(id: string): Promise<LanguageDto> {
        const existing = await this.findOne(id);
        const result = await this.languageRepository.deleteIfUnused(id);

        if (result.status === 'missing') {
            throw new LanguageNotFoundException(id);
        }
        if (result.status === 'in-use') {
            throw new LanguageInUseException(id, existing.name, result.usage);
        }

        return this.languageMapper.toResponse(result.language);
    }

    /** Every language with how many vocabs and folders use it. Uncached, so the counts are current. */
    public async findAllForAdmin(): Promise<AdminLanguageDto[]> {
        const [languages, vocabPairs, folderPairs] = await Promise.all([
            this.languageRepository.findAllUncached(),
            this.languageRepository.findVocabLanguagePairs(),
            this.languageRepository.findFolderLanguagePairs(),
        ]);

        return languages.map((language) =>
            this.languageMapper.toAdminResponse(language, {
                vocabCount: countUsageForCode(vocabPairs, language.code),
                folderCount: countUsageForCode(folderPairs, language.code),
            }),
        );
    }
}
