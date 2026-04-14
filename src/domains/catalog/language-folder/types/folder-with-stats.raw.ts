export interface FolderWithStatsRaw {
    id: string;
    name: string;
    folderColor: string;
    createdAt: Date;
    updatedAt: Date;
    userId: string;
    sourceLanguageCode: string;
    targetLanguageCode: string;
    sourceLanguageName: string | null;
    targetLanguageName: string | null;
    vocabCount: number;
    averageMastery: number | null;
}
