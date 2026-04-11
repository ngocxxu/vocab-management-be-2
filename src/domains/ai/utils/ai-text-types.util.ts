export type WordTypeRecord = { id: string; name: string; description: string };
export type TextTargetRecord = { textTarget: string };
export type LanguageRecord = { name: string };

export type VocabForTextTargets = {
    textSource: string;
    sourceLanguageCode: string;
    targetLanguageCode: string;
    textTargets?: TextTargetRecord[];
};
