import * as csv from 'csv-parser';
import { Readable } from 'stream';
import { VocabDto } from '../model/vocab.dto';

// Interface for CSV row data to avoid any type issues
export interface CsvRowData {
    textSource: string;
    textTarget: string;
    wordType?: string;
    grammar?: string;
    explanationSource?: string;
    explanationTarget?: string;
    subjects?: string;
    exampleSource?: string;
    exampleTarget?: string;
}

export interface ParsedCsvData {
    rows: CsvRowData[];
    groupedByTextSource: Map<string, CsvRowData[]>;
}

export class CsvParserUtil {
    /**
     * Parse CSV buffer to array of CsvRowData
     * @param buffer CSV file buffer
     * @returns Promise<ParsedCsvData> Parsed CSV data with grouped rows
     */
    public static async parseCsvBuffer(buffer: Buffer): Promise<ParsedCsvData> {
        return new Promise((resolve, reject) => {
            const rows: CsvRowData[] = [];
            const groupedByTextSource = new Map<string, CsvRowData[]>();

            const stream = Readable.from(buffer.toString());

            stream
                .pipe(csv())
                .on('data', (row: Record<string, string>) => {
                    // Convert CSV row to CsvRowData
                    const csvRow: CsvRowData = {
                        textSource: row.textSource?.trim() || '',
                        textTarget: row.textTarget?.trim() || '',
                        wordType: row.wordType?.trim() || undefined,
                        grammar: row.grammar?.trim() || undefined,
                        explanationSource: row.explanationSource?.trim() || undefined,
                        explanationTarget: row.explanationTarget?.trim() || undefined,
                        subjects: row.subjects?.trim() || undefined,
                        exampleSource: row.exampleSource?.trim() || undefined,
                        exampleTarget: row.exampleTarget?.trim() || undefined,
                    };

                    // Skip empty rows
                    if (csvRow.textSource && csvRow.textTarget) {
                        rows.push(csvRow);

                        // Group by textSource
                        const textSource = csvRow.textSource.toLowerCase();
                        if (!groupedByTextSource.has(textSource)) {
                            groupedByTextSource.set(textSource, []);
                        }
                        const existingRows = groupedByTextSource.get(textSource);
                        if (existingRows) {
                            existingRows.push(csvRow);
                        }
                    }
                })
                .on('end', () => {
                    resolve({
                        rows,
                        groupedByTextSource,
                    });
                })
                .on('error', (error: Error) => {
                    reject(new Error(`CSV parsing failed: ${error.message}`));
                });
        });
    }

    /**
     * Validate CSV headers
     * @param buffer CSV file buffer
     * @returns boolean True if headers are valid
     */
    public static validateCsvHeaders(buffer: Buffer): boolean {
        const firstLine = buffer.toString().split('\n')[0];
        const headers = firstLine.split(',').map((h) => h.trim().toLowerCase());

        const requiredHeaders = ['textsource', 'texttarget'];
        const optionalHeaders = [
            'wordtype',
            'grammar',
            'explanationsource',
            'explanationtarget',
            'subjects',
            'examplesource',
            'exampletarget',
        ];

        // Check if required headers exist
        const hasRequiredHeaders = requiredHeaders.every((header) => headers.includes(header));

        if (!hasRequiredHeaders) {
            return false;
        }

        // Check for unknown headers
        const allValidHeaders = [...requiredHeaders, ...optionalHeaders];
        const unknownHeaders = headers.filter((header) => !allValidHeaders.includes(header));

        return unknownHeaders.length === 0;
    }

    /**
     * Parse subject names from comma-separated string
     * @param subjectsString Comma-separated subject names
     * @returns string[] Array of subject names
     */
    public static parseSubjects(subjectsString?: string): string[] {
        if (!subjectsString) {
            return [];
        }

        return subjectsString
            .split(',')
            .map((subject) => subject.trim())
            .filter((subject) => subject.length > 0);
    }

    /**
     * Generate CSV buffer from VocabDto array
     * @param vocabs Array of VocabDto
     * @returns Buffer CSV file buffer
     */
    public static generateCsvBuffer(vocabs: VocabDto[]): Buffer {
        const headers = [
            'textSource',
            'textTarget',
            'wordType',
            'grammar',
            'explanationSource',
            'explanationTarget',
            'subjects',
            'exampleSource',
            'exampleTarget',
        ];

        const rows: string[] = [];
        rows.push(headers.join(','));

        for (const vocab of vocabs) {
            const textSource = this.escapeCsvField(vocab.textSource);

            if (!vocab.textTargets || vocab.textTargets.length === 0) {
                const emptyRow = [textSource, '', '', '', '', '', '', '', ''];
                rows.push(emptyRow.join(','));
                continue;
            }

            for (const textTarget of vocab.textTargets) {
                const textTargetValue = this.escapeCsvField(textTarget.textTarget);
                const wordType = this.escapeCsvField(textTarget.wordType?.name || '');
                const grammar = this.escapeCsvField(textTarget.grammar || '');
                const explanationSource = this.escapeCsvField(textTarget.explanationSource || '');
                const explanationTarget = this.escapeCsvField(textTarget.explanationTarget || '');

                const subjects =
                    textTarget.textTargetSubjects
                        ?.map((tts) => tts.subject?.name || '')
                        .filter((name) => name)
                        .join(', ') || '';

                const subjectsEscaped = this.escapeCsvField(subjects);

                const example =
                    textTarget.vocabExamples && textTarget.vocabExamples.length > 0
                        ? textTarget.vocabExamples[0]
                        : undefined;

                const exampleSource = this.escapeCsvField(example?.source || '');
                const exampleTarget = this.escapeCsvField(example?.target || '');

                const row = [
                    textSource,
                    textTargetValue,
                    wordType,
                    grammar,
                    explanationSource,
                    explanationTarget,
                    subjectsEscaped,
                    exampleSource,
                    exampleTarget,
                ];

                rows.push(row.join(','));
            }
        }

        return Buffer.from(rows.join('\n'));
    }

    /**
     * Escape CSV field values
     * @param field CSV field value
     * @returns string Escaped CSV field
     */
    private static escapeCsvField(field: string): string {
        if (!field) {
            return '';
        }

        const escaped = field.replace(/"/g, '""');

        if (escaped.includes(',') || escaped.includes('\n') || escaped.includes('"')) {
            return `"${escaped}"`;
        }

        return escaped;
    }
}
