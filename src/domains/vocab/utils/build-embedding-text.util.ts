/**
 * Composes the text sent to the embedding model for one Vocab.
 *
 * Deliberately narrow: textSource + textTarget[] only — no explanations, no
 * examples. This choice is locked once vectors exist in Qdrant; changing it
 * requires re-embedding every row. See the plan for the full rationale
 * (signal strength for multilingual search vs. dilution from long examples).
 */
export function buildEmbeddingText(textSource: string, textTargets: string[]): string {
    const parts = [textSource, ...textTargets].map((part) => part.trim()).filter((part) => part.length > 0);

    return parts.join(' | ');
}
