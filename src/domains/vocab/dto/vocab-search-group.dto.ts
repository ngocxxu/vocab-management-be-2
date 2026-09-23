import { ApiProperty } from '@nestjs/swagger';
import { VocabDto } from './vocab.dto';

/**
 * One language folder's slice of a cross-folder semantic search.
 *
 * Results are bucketed rather than merged because multilingual embeddings
 * favour same-language and English matches — see QdrantService.searchGrouped.
 */
export class VocabSearchGroupDto {
    @ApiProperty({ description: 'Language folder these results belong to' })
    public readonly languageFolderId: string;

    /**
     * Null when the folder was deleted between the Qdrant hit and this lookup,
     * or (for the substring fallback) when the name lookup itself failed — the
     * client falls back to the language pair label in either case.
     */
    @ApiProperty({ description: "This folder's display name", nullable: true })
    public readonly languageFolderName: string | null;

    @ApiProperty({ description: 'Best matches inside this folder, most relevant first', isArray: true, type: VocabDto })
    public readonly vocabs: VocabDto[];

    public constructor(languageFolderId: string, languageFolderName: string | null, vocabs: VocabDto[]) {
        this.languageFolderId = languageFolderId;
        this.languageFolderName = languageFolderName;
        this.vocabs = vocabs;
    }
}
