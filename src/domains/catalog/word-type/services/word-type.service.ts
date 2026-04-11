import { HttpStatus, Injectable } from '@nestjs/common';
import { IResponse } from '@/shared';
import { WordTypeNotFoundException } from '../exceptions';
import { WordTypeMapper } from '../mappers';
import { WordTypeDto, WordTypeInput } from '../dto';
import { WordTypeRepository } from '../repositories';

@Injectable()
export class WordTypeService {
    private readonly wordTypeMapper = new WordTypeMapper();

    public constructor(private readonly wordTypeRepository: WordTypeRepository) {}

    public async find(): Promise<IResponse<WordTypeDto[]>> {
        const wordTypes = await this.wordTypeRepository.findAll();

        return {
            items: this.wordTypeMapper.toResponseList(wordTypes),
            statusCode: HttpStatus.OK,
        };
    }

    public async findOne(id: string): Promise<WordTypeDto> {
        const wordType = await this.wordTypeRepository.findById(id);

        if (!wordType) {
            throw new WordTypeNotFoundException(id);
        }

        return this.wordTypeMapper.toResponse(wordType);
    }

    public async create(createWordTypeData: WordTypeInput): Promise<WordTypeDto> {
        const wordType = await this.wordTypeRepository.create(
            this.wordTypeMapper.toCreateInput(createWordTypeData),
        );

        return this.wordTypeMapper.toResponse(wordType);
    }

    public async update(
        id: string,
        updateWordTypeData: Partial<WordTypeInput>,
    ): Promise<WordTypeDto> {
        await this.findOne(id);

        const wordType = await this.wordTypeRepository.update(
            id,
            this.wordTypeMapper.buildUpdateInput(updateWordTypeData),
        );

        return this.wordTypeMapper.toResponse(wordType);
    }

    public async delete(id: string): Promise<WordTypeDto> {
        await this.findOne(id);
        const wordType = await this.wordTypeRepository.delete(id);

        return this.wordTypeMapper.toResponse(wordType);
    }
}
