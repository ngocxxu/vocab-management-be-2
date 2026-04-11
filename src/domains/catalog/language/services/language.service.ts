import { IResponse } from '@/shared';
import { HttpStatus, Injectable } from '@nestjs/common';
import { LanguageDto, LanguageInput } from '../dto';
import { LanguageNotFoundException } from '../exceptions';
import { LanguageMapper } from '../mappers';
import { LanguageRepository } from '../repositories';

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

    public async update(id: string, updateLanguageData: Partial<LanguageInput>): Promise<LanguageDto> {
        await this.findOne(id);

        const language = await this.languageRepository.update(id, this.languageMapper.buildUpdateInput(updateLanguageData));

        return this.languageMapper.toResponse(language);
    }

    public async delete(id: string): Promise<LanguageDto> {
        await this.findOne(id);
        const language = await this.languageRepository.delete(id);

        return this.languageMapper.toResponse(language);
    }
}
