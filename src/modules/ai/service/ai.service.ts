import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { Queue } from 'bullmq';
import { LanguageRepository } from '../../language/repository';
import { EReminderType } from '../../reminder/util';
import { CreateTextTargetInput } from '../../vocab/model/vocab.input';
import { VocabWithTextTargets, shuffleArray } from '../../vocab-trainer/util';
import { WordTypeRepository } from '../../word-type/repository';
import { AudioEvaluationJobData } from '../processor/audio-evaluation.processor';
import { MultipleChoiceGenerationJobData } from '../processor/multiple-choice-generation.processor';
import { AiProviderFactory } from '../provider/ai-provider.factory';
import { AI_CONFIG } from '../util/const.util';
import { EvaluationResult, MultipleChoiceQuestion } from '../util/type.util';
@Injectable()
export class AiService {
    private readonly logger = new Logger(AiService.name);
    private readonly languageNameCache = new Map<string, string>();

    public constructor(
        private readonly providerFactory: AiProviderFactory,
        private readonly languageRepository: LanguageRepository,
        private readonly wordTypeRepository: WordTypeRepository,

        @InjectQueue(EReminderType.AUDIO_EVALUATION)
        private readonly audioEvaluationQueue: Queue,
        @InjectQueue(EReminderType.MULTIPLE_CHOICE_GENERATION)
        private readonly multipleChoiceQueue: Queue,
        @InjectQueue(EReminderType.FILL_IN_BLANK_EVALUATION)
        private readonly fillInBlankEvaluationQueue: Queue,
    ) {}

    /**
     * Translate vocab using AI when textTargets is empty
     */
    public async translateVocab(
        textSource: string,
        sourceLanguageCode: string,
        targetLanguageCode: string,
        subjectIds?: string[],
        userId?: string,
        retryCount = 0,
    ): Promise<CreateTextTargetInput> {
        try {
            const allowedWordTypes = await this.wordTypeRepository.findAll();
            const simplifiedWordTypes = allowedWordTypes.map((wt) => ({
                id: wt.id,
                name: wt.name,
                description: wt.description,
            }));

            const wordTypeListString = JSON.stringify(simplifiedWordTypes, null, 2);

            const prompt = `
You are an expert linguistic API. Translate a vocabulary word from ${sourceLanguageCode} to ${targetLanguageCode} and classify it strictly according to the provided schema.

Input Data:
- Source Text: "${textSource}"
- Source Language: ${sourceLanguageCode}
- Target Language: ${targetLanguageCode}

*** AUTHORIZED WORD TYPES ***
You must classify the "wordType" field using EXACTLY one of the strings from this list:
${wordTypeListString}

Task Requirements:
1. textTarget: The translation in ${targetLanguageCode}.
2. wordType: Select the most accurate 'name' from the Authorized Word Types list above.
3. explanationSource: Brief meaning in ${sourceLanguageCode}.
4. explanationTarget: Brief meaning in ${targetLanguageCode}.
5. vocabExamples: One clear usage example.

Format your response as a JSON object (NO Markdown, NO code blocks):
{
    "textTarget": "translated_word",
    "wordTypeId": "MUST be the exact UUID/ID from the reference list matching the word type",
    "explanationSource": "explanation in source language",
    "explanationTarget": "explanation in target language",
    "vocabExamples": [
        {
            "source": "example sentence with source word",
            "target": "example sentence with translated word"
        }
    ]
}
`;

            const provider = await this.providerFactory.getProvider(userId);
            const text = await provider.generateContent(prompt, userId);

            const parsedResponse = this.parseTranslationResponse(text);

            return {
                ...parsedResponse,
                subjectIds: subjectIds || [],
            };
        } catch (error) {
            this.logger.error(
                `Error translating vocab "${textSource}" (attempt ${retryCount + 1}):`,
                error,
            );

            if (retryCount < AI_CONFIG.maxRetries) {
                this.logger.warn(`Retrying translation for "${textSource}"...`);
                await this.delay(AI_CONFIG.retryDelayMs * (retryCount + 1));
                return this.translateVocab(
                    textSource,
                    sourceLanguageCode,
                    targetLanguageCode,
                    subjectIds,
                    userId,
                    retryCount + 1,
                );
            }

            throw error;
        }
    }

    /**
     * Generate multiple choice questions for vocabulary training
     */
    public async generateMultipleChoiceQuestions(
        vocabList: VocabWithTextTargets[],
        userId?: string,
    ): Promise<MultipleChoiceQuestion[]> {
        try {
            if (vocabList.length === 0) {
                return [];
            }

            return await this.generateAllQuestionsInBatch(vocabList, userId);
        } catch (error) {
            this.logger.error('Error generating multiple choice questions:', error);
            throw error;
        }
    }

    /**
     * Evaluate all fill-in-blank answers in a single batch request
     */
    public async evaluateAllFillInBlankAnswers(
        evaluations: Array<{
            vocab: VocabWithTextTargets;
            userAnswer: string;
            systemAnswer: string;
            questionType: 'textSource' | 'textTarget';
        }>,
        userId?: string,
    ): Promise<Array<{ isCorrect: boolean; explanation?: string }>> {
        if (evaluations.length === 0) {
            return [];
        }

        const evaluationDetailsPromises = evaluations.map(async (evaluationItem, idx) => {
            const vocab = evaluationItem.vocab;
            const targetTexts = vocab.textTargets.map((tt) => tt.textTarget).join(', ');
            const sourceLanguageName = await this.getLanguageName(vocab.sourceLanguageCode);
            const targetLanguageName = await this.getLanguageName(vocab.targetLanguageCode);
            const questionContext =
                evaluationItem.questionType === 'textSource'
                    ? `What is the translation of "${vocab.textSource}" in ${targetLanguageName}?`
                    : `What is the translation of "${evaluationItem.systemAnswer}" in ${sourceLanguageName}?`;

            return (
                `${idx + 1}. Source language: ${sourceLanguageName}, ` +
                `Target language: ${targetLanguageName}, ` +
                `Source word: "${vocab.textSource}", Target word(s): "${targetTexts}", ` +
                `Question: ${questionContext}, ` +
                `Correct answer (List): "${targetTexts}", ` +
                `Student's answer: "${evaluationItem.userAnswer}"`
            );
        });

        const evaluationDetails = (await Promise.all(evaluationDetailsPromises)).join('\n\n');

        const prompt = `
        You are an expert linguistic evaluator. Your task is to assess student translations with semantic flexibility, avoiding rigid string matching.
        
        Input Data:
        ${evaluationDetails}
        
        CRITICAL EVALUATION RULES:
        
        1. **Normalization (Fix for formatting errors)**:
           - Before comparing, ignore all case sensitivity (uppercase/lowercase).
           - LEADING/TRAILING WHITESPACE or extra spaces between words must be IGNORED.
           - Punctuation differences should be ignored unless they change the meaning.
           - *Logic:* If the student's text is identical to the target text after trimming spaces and lowercase conversion, mark it TRUE.
        
        2. **Source-Based Validation (Fix for synonyms)**:
           - Evaluate the relationship between the **Student's Answer** and the **Source Word** directly.
           - If the student's answer is a valid, natural translation or a close synonym of the Source Word (even if not listed in the "Target word(s)"), mark it TRUE.
        
        3. **Multi-Value & Partial Match (Crucial for Vocabulary)**:
           - When the "Target word(s)" or "Correct answer" contains multiple meanings separated by commas (e.g., "Meaning A, Meaning B"):
             - **ONE OF MANY:** The student is CORRECT if they provide **ANY ONE** of the meanings (e.g., just "Meaning A").
             - **ALL:** The student is CORRECT if they provide **ALL** meanings (e.g., "Meaning A, Meaning B").
             - **SYNONYM:** The student is CORRECT if they provide a valid synonym for **ANY** of the meanings.
        
        OUTPUT FORMAT:
        Return ONLY a valid JSON array. No markdown, no code blocks.
        Explanation must be in Vietnamese.
        
        [
            {
                "answerIndex": 0,
                "isCorrect": true/false,
                "explanation": "Brief explanation in Vietnamese. Explicitly state if the answer is one of the valid meanings."
            }
        ]
        `;

        try {
            const provider = await this.providerFactory.getProvider(userId);
            const text = await provider.generateContent(prompt, userId);

            const batchResponse = this.parseBatchEvaluationResponse(text);

            const results: Array<{ isCorrect: boolean; explanation?: string }> = [];
            evaluations.forEach((_, idx) => {
                const responseItem = batchResponse.find((item) => item.answerIndex === idx);
                if (responseItem) {
                    results.push({
                        isCorrect: responseItem.isCorrect,
                        explanation: responseItem.explanation,
                    });
                } else {
                    results.push({ isCorrect: false });
                }
            });

            return results;
        } catch (error) {
            this.logger.error('Error evaluating fill-in-blank answers in batch:', error);
            throw error;
        }
    }

    public async queueAudioEvaluation(params: {
        fileId: string;
        targetDialogue: Array<{ speaker: string; text: string }>;
        sourceLanguage: string;
        targetLanguage: string;
        sourceWords: string[];
        targetStyle?: 'formal' | 'informal';
        targetAudience?: string;
        userId: string;
        vocabTrainerId: string;
    }): Promise<{ jobId: string }> {
        const job = await this.audioEvaluationQueue.add('evaluate-audio', {
            ...params,
        } as Omit<AudioEvaluationJobData, 'jobId'>);

        return { jobId: job.id || '' };
    }

    public async queueMultipleChoiceGeneration(params: {
        vocabTrainerId: string;
        vocabList: VocabWithTextTargets[];
        userId: string;
    }): Promise<{ jobId: string }> {
        const job = await this.multipleChoiceQueue.add('generate-questions', {
            ...params,
        } as MultipleChoiceGenerationJobData);

        return { jobId: job.id || '' };
    }

    public async queueFillInBlankEvaluation(params: {
        vocabTrainerId: string;
        evaluations: Array<{
            vocab: VocabWithTextTargets;
            userAnswer: string;
            systemAnswer: string;
            questionType: 'textSource' | 'textTarget';
            vocabId: string;
        }>;
        answerSubmissions: Array<{
            userAnswer: string;
            systemAnswer: string;
        }>;
        userId: string;
    }): Promise<{ jobId: string }> {
        const job = await this.fillInBlankEvaluationQueue.add('evaluate-answers', {
            ...params,
        } as Omit<import('../processor/fill-in-blank-evaluation.processor').FillInBlankEvaluationJobData, 'jobId'>);

        return { jobId: job.id || '' };
    }

    public async downloadAudioFromCloudinary(fileId: string): Promise<Buffer> {
        try {
            const cloudinaryUrl = process.env.CLOUDINARY_URL;
            if (!cloudinaryUrl) {
                throw new Error('CLOUDINARY_URL environment variable is required');
            }

            const urlMatch = /cloudinary:\/\/([^:]+):([^@]+)@(.+)/.exec(cloudinaryUrl);
            if (!urlMatch) {
                throw new Error('Invalid CLOUDINARY_URL format');
            }

            const [, , , cloudName] = urlMatch;
            const url = `https://res.cloudinary.com/${cloudName}/raw/upload/${fileId}`;

            const response = await axios.get(url, {
                responseType: 'arraybuffer',
            });

            return Buffer.from(response.data);
        } catch (error) {
            this.logger.error(`Failed to download audio from Cloudinary: ${error}`);
            throw new Error(
                `Failed to download audio: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
        }
    }

    public async transcribeAudio(
        audioBuffer: Buffer,
        mimeType: string,
        sourceLanguage: string,
        userId?: string,
        retryCount = 0,
    ): Promise<string> {
        try {
            const provider = await this.providerFactory.getAudioProvider(userId);
            return await provider.transcribeAudio(audioBuffer, mimeType, sourceLanguage, userId);
        } catch (error) {
            this.logger.error(`Error transcribing audio (attempt ${retryCount + 1}):`, error);

            if (retryCount < AI_CONFIG.maxRetries) {
                this.logger.warn('Retrying audio transcription...');
                await this.delay(AI_CONFIG.retryDelayMs * (retryCount + 1));
                return this.transcribeAudio(
                    audioBuffer,
                    mimeType,
                    sourceLanguage,
                    userId,
                    retryCount + 1,
                );
            }

            throw error;
        }
    }

    public async evaluateTranslation(params: {
        targetDialogue: Array<{ speaker: string; text: string }>;
        transcript: string;
        sourceLanguage: string;
        targetLanguage: string;
        sourceWords: string[];
        targetStyle?: 'formal' | 'informal';
        targetAudience?: string;
        userId?: string;
        retryCount?: number;
    }): Promise<EvaluationResult> {
        const {
            targetDialogue,
            transcript,
            sourceLanguage: sourceLanguageCode,
            targetLanguage: targetLanguageCode,
            sourceWords,
            targetStyle,
            targetAudience,
            userId,
            retryCount = 0,
        } = params;

        try {
            const sourceLanguage = await this.getLanguageName(sourceLanguageCode);
            const targetLanguage = await this.getLanguageName(targetLanguageCode);

            const dialogueText = targetDialogue
                .map((item) => `${item.speaker}: "${item.text}"`)
                .join('\n');

            const sourceWordsList = sourceWords.join(', ');
            const styleContext = targetStyle ? `target style = ${targetStyle}` : '';
            const audienceContext = targetAudience ? `target audience = ${targetAudience}` : '';
            const context = [styleContext, audienceContext].filter(Boolean).join(', ');

            const prompt = `
You are a strict evaluator for translation quality between ${targetLanguage} → ${sourceLanguage}. 
You must follow STRICT SCORING RULES and NEVER give generous scores.

Your job:
- Compare the user's ${sourceLanguage} translation (ASR transcript) against the original ${targetLanguage} dialogue.
- Detect any missing meaning, added meaning, mistranslation, incorrect register, grammar issues, or incorrect tense.
- CRITICALLY IMPORTANT: The user's translation MUST use the source words or their synonyms: ${sourceWordsList}
- Penalize SEVERELY if the user does not use the required source words or their synonyms
- Penalize SEVERELY for omissions, additions, or incorrect interpretation of meaning.

Scoring rules (VERY STRICT):
- accuracy = 10 only if semantic meaning aligns ≥ 95% AND the required source words (or synonyms) are used.
- Every missing key idea = -2 points.
- Every mistranslation of critical meaning = -2 to -3 points.
- Every invented meaning (addition) = -3 points.
- If required source words are not used (or their synonyms), deduct -3 to -5 points from accuracy.
- completeness = proportional to meaning coverage:
    completeness = round( (covered_meaning_percent) / 10 )
- fluency = evaluate grammar, naturalness, cohesion.
- register = evaluate tone, formality, appropriateness.

overallScore:
- Automatically computed as:
  overallScore = accuracy*2.5 + fluency*2 + register*1.5 + completeness*4
- Clamp 0–100.

Return ONLY JSON with structure:

{
    "overallScore": number,
    "scores": {
        "accuracy": number,
        "fluency": number,
        "register": number,
        "completeness": number
    },
    "errors": [
        {
            "index": number,
            "span": "text fragment",
            "type": "omission | addition | wrong_lex | tense | register",
            "explanation": "what is wrong and why",
            "suggestion": "corrected version"
        }
    ],
    "missingIdeas": [
        "list each missing idea from source dialogue"
    ],
    "correctedTranslation": "Full corrected translation in ${sourceLanguage}",
    "advice": ["strict actionable improvements"]
}

Source dialogue (${targetLanguage}):
${dialogueText}

User ASR transcript (${sourceLanguage}):
"${transcript}"

Required source words (or synonyms) that MUST be used: ${sourceWordsList}

${context ? `Context: ${context}` : ''}
            `;

            const provider = await this.providerFactory.getProvider(userId);
            const text = await provider.generateContent(prompt, userId);

            const parsedResponse = this.parseEvaluationResponse(text);
            return parsedResponse;
        } catch (error) {
            this.logger.error(`Error evaluating translation (attempt ${retryCount + 1}):`, error);

            if (retryCount < AI_CONFIG.maxRetries) {
                this.logger.warn('Retrying translation evaluation...');
                await this.delay(AI_CONFIG.retryDelayMs * (retryCount + 1));
                return this.evaluateTranslation({
                    ...params,
                    retryCount: retryCount + 1,
                });
            }

            throw error;
        }
    }

    public formatMarkdownReport(evaluation: EvaluationResult, transcript: string): string {
        const safe = <T, U>(v: T | undefined, d: U) => v ?? (d as unknown as T);

        let report = '# Translation Evaluation Report\n\n';

        // Overall + score breakdown
        report += `## Overall Score: ${safe(evaluation.overallScore, 0)} / 100\n\n`;
        report += '### Detailed Scores (scale 0–10)\n';
        report += `- **Accuracy**: ${safe(
            evaluation.scores?.accuracy,
            0,
        )}/10 — Semantic correctness (penalize omissions/additions). \n`;
        report += `- **Fluency**: ${safe(
            evaluation.scores?.fluency,
            0,
        )}/10 — Naturalness, grammar, cohesion.\n`;
        report += `- **Register**: ${safe(
            evaluation.scores?.register,
            0,
        )}/10 — Tone / formality appropriateness.\n`;
        report += `- **Completeness**: ${safe(
            evaluation.scores?.completeness,
            0,
        )}/10 — Coverage of source ideas (computed from meaning coverage %).\n\n`;

        // Optional: show scoring formula used by evaluator
        report += '### Scoring Formula\n';
        report +=
            'OverallScore = accuracy * 2.5 + fluency * 2 + register * 1.5 + completeness * 4 (clamped 0–100)\n\n';

        // Errors
        const errors = safe(evaluation.errors, []);
        if (Array.isArray(errors) && errors.length > 0) {
            report += '## Errors Found (ordered)\n\n';
            errors.forEach((error) => {
                const idx = typeof error.index === 'number' ? error.index : undefined;
                const indexPrefix = idx === undefined ? '' : `**${idx}.**`;
                report += `${indexPrefix}**Location**: ${safe(error.span, '(unknown span)')}  \n`;
                report += `- **Type**: ${safe(error.type, '(unknown)')}  \n`;
                report += `- **Issue**: ${safe(error.explanation, '(no explanation)')}  \n`;
                report += `- **Suggestion**: ${safe(error.suggestion, '(no suggestion)')}  \n\n`;
            });
        } else {
            report += '## Errors Found\n\nNo specific errors detected.\n\n';
        }

        // Source / transcript
        report += '## Your Transcript (ASR)\n\n';
        report += `${transcript || '(no transcript)'}\n\n`;

        // Corrected translation
        report += '## Corrected Translation (full)\n\n';
        report += `${safe(evaluation.correctedTranslation, '(no corrected translation)')}\n\n`;

        // Missing ideas
        const missing = safe(evaluation.missingIdeas, []);
        if (Array.isArray(missing) && missing.length > 0) {
            report +=
                '## Missing Ideas (explicit list of source ideas not covered by the transcript)\n\n';
            missing.forEach((mi, i) => {
                report += `${i + 1}. ${mi}\n`;
            });
            report += '\n';
        }

        // Advice / improvement tips
        const advice = safe(evaluation.advice, []);
        if (Array.isArray(advice) && advice.length > 0) {
            report += '## Improvement Tips (actionable)\n\n';
            advice.forEach((tip) => {
                report += `- ${tip}\n`;
            });
            report += '\n';
        }

        return report;
    }

    public async generateDialogueForVocabs(
        targetLanguageWords: string[],
        sourceLanguageWords: string[],
        targetLanguage: string,
        sourceLanguage: string,
        userId?: string,
        retryCount = 0,
    ): Promise<{ dialogue: Array<{ speaker: string; text: string }>; vocabWordsUsed: string[] }> {
        try {
            const targetLanguageName = await this.getLanguageName(targetLanguage);
            const sourceLanguageName = await this.getLanguageName(sourceLanguage);

            const wordsList = targetLanguageWords.join(', ');
            const sourceWordsList = sourceLanguageWords.join(', ');
            const prompt = `
You are a language learning assistant. Generate a natural dialogue between two speakers (A and B) 
in ${targetLanguageName} that incorporates ALL of the following vocabulary words naturally:

Vocabulary words (${targetLanguageName}): ${wordsList}

Important context:
- This dialogue will be translated by the user from ${targetLanguageName} to ${sourceLanguageName}
- When the user translates this dialogue, they MUST use the source words or their synonyms: ${sourceWordsList}
- The dialogue should be structured so that when translated, it naturally requires the use of these source words

Requirements:
1. Create a conversation between speakers A and B
2. Use ALL the provided vocabulary words naturally in context
3. The dialogue should be realistic and appropriate
4. The dialogue must have EXACTLY 4 lines total: 2 lines from speaker A and 2 lines from speaker B
5. Return the dialogue in JSON format

Format your response as JSON:
{
    "dialogue": [
        {"speaker": "A", "text": "..."},
        {"speaker": "B", "text": "..."},
        {"speaker": "A", "text": "..."},
        {"speaker": "B", "text": "..."}
    ]
}

Return ONLY the JSON object, no markdown formatting, no code blocks, no additional text.
            `;

            const provider = await this.providerFactory.getProvider(userId);
            const text = await provider.generateContent(prompt, userId);

            const parsedResponse = this.parseDialogueResponse(text);
            return parsedResponse;
        } catch (error) {
            const isRateLimitError = axios.isAxiosError(error) && error.response?.status === 429;

            if (isRateLimitError) {
                this.logger.warn(
                    `Rate limit exceeded when generating dialogue (attempt ${retryCount + 1}):`,
                );
            } else {
                this.logger.error(`Error generating dialogue (attempt ${retryCount + 1}):`, error);
            }

            throw error;
        }
    }

    /**
     * Generate all multiple choice questions in a single batch request
     */
    private async generateAllQuestionsInBatch(
        vocabList: VocabWithTextTargets[],
        userId?: string,
    ): Promise<MultipleChoiceQuestion[]> {
        const vocabItems: Array<{
            index: number;
            vocab: VocabWithTextTargets;
            questionType: 'source' | 'target';
            selectedTarget?: string;
        }> = [];

        vocabList.forEach((vocab, index) => {
            if (!vocab.textTargets || vocab.textTargets.length === 0) {
                return;
            }

            const isAskingSource = Math.random() < AI_CONFIG.sourceQuestionProbability;
            const selectedTarget =
                vocab.textTargets[Math.floor(Math.random() * vocab.textTargets.length)];

            vocabItems.push({
                index,
                vocab,
                questionType: isAskingSource ? 'source' : 'target',
                selectedTarget: selectedTarget.textTarget,
            });
        });

        if (vocabItems.length === 0) {
            return [];
        }

        const vocabDetailsPromises = vocabItems.map(async (item, idx) => {
            const vocab = item.vocab;
            const targetTexts = vocab.textTargets.map((tt) => tt.textTarget).join(', ');
            const sourceLanguageName = await this.getLanguageName(vocab.sourceLanguageCode);
            const targetLanguageName = await this.getLanguageName(vocab.targetLanguageCode);
            const questionDirection =
                item.questionType === 'source'
                    ? `What is the translation of "${vocab.textSource}" in ${targetLanguageName}?`
                    : `What is the translation of "${item.selectedTarget}" in ${sourceLanguageName}?`;
            const correctAnswer =
                item.questionType === 'source' ? item.selectedTarget : vocab.textSource;

            return (
                `${idx + 1}. Source: "${vocab.textSource}", Target(s): "${targetTexts}", ` +
                `Languages: ${sourceLanguageName} → ${targetLanguageName}, ` +
                `Question: ${questionDirection}, Correct Answer: "${correctAnswer}"`
            );
        });

        const vocabDetails = (await Promise.all(vocabDetailsPromises)).join('\n');

        const prompt = `
You are a language learning assistant. Generate multiple choice questions for vocabulary practice.

Vocabulary items:
${vocabDetails}

Task: Create exactly ${
            vocabItems.length
        } multiple choice questions, one for each vocabulary item above.

Requirements for each question:
1. The question should ask for the translation as specified
2. Provide exactly ${AI_CONFIG.questionCount} options (A, B, C, D)
3. One option must be the correct answer as specified
4. Generate ${AI_CONFIG.questionCount - 1} plausible but incorrect options that are:
   - Similar length to the correct answer
   - Related to the same topic/context
   - Common words in the target language
   - Not obviously wrong

For each question, determine the question type:
- If question asks "What is the translation of [source] in [target language]?" → type should be "textTarget"
- If question asks "What is the translation of [target] in [source language]?" → type should be "textSource"

Format your response as JSON array:
[
    {
        "vocabIndex": 0,
        "type": "textTarget" or "textSource",
        "content": "What is the translation of 'word1' in Vietnamese?",
        "options": [
            {"label": "correct_answer", "value": "correct_answer"},
            {"label": "wrong_option_1", "value": "wrong_option_1"},
            {"label": "wrong_option_2", "value": "wrong_option_2"},
            {"label": "wrong_option_3", "value": "wrong_option_3"}
        ],
        "correctAnswer": "correct_answer"
    },
    ...
]

Return ONLY the JSON array, no markdown formatting, no code blocks, no additional text.
        `;

        const provider = await this.providerFactory.getProvider(userId);
        const text = await provider.generateContent(prompt, userId);

        const batchResponse = this.parseBatchQuestionsResponse(text);

        const questions: MultipleChoiceQuestion[] = [];
        batchResponse.forEach((item) => {
            if (item.vocabIndex >= 0 && item.vocabIndex < vocabItems.length) {
                const shuffledOptions = shuffleArray(item.options);

                questions.push({
                    correctAnswer: item.correctAnswer,
                    type: item.type as 'textSource' | 'textTarget',
                    content: item.content,
                    options: shuffledOptions,
                });
            }
        });

        return questions;
    }

    /**
     * Parse batch questions response from AI
     */
    private parseBatchQuestionsResponse(text: string): Array<{
        vocabIndex: number;
        type: string;
        content: string;
        options: Array<{ label: string; value: string }>;
        correctAnswer: string;
    }> {
        let jsonText = text.trim();
        if (jsonText.startsWith('```json')) {
            jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (jsonText.startsWith('```')) {
            jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }

        const parsed = JSON.parse(jsonText) as Array<{
            vocabIndex: number;
            type: string;
            content: string;
            options: Array<{ label: string; value: string }>;
            correctAnswer: string;
        }>;

        if (!Array.isArray(parsed)) {
            throw new TypeError('Invalid batch response format: expected array');
        }

        return parsed;
    }

    /**
     * Parse batch evaluation response from AI
     */
    private parseBatchEvaluationResponse(text: string): Array<{
        answerIndex: number;
        isCorrect: boolean;
        explanation?: string;
    }> {
        let jsonText = text.trim();
        if (jsonText.startsWith('```json')) {
            jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (jsonText.startsWith('```')) {
            jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }

        const parsed = JSON.parse(jsonText) as Array<{
            answerIndex: number;
            isCorrect: boolean;
            explanation?: string;
        }>;

        if (!Array.isArray(parsed)) {
            throw new TypeError('Invalid batch evaluation response format: expected array');
        }

        return parsed;
    }

    /**
     * Parse translation response from AI model
     */
    private parseTranslationResponse(text: string): CreateTextTargetInput {
        let jsonText = text.trim();
        if (jsonText.startsWith('```json')) {
            jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (jsonText.startsWith('```')) {
            jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const parsed = JSON.parse(jsonText);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return parsed as CreateTextTargetInput;
    }

    /**
     * Utility method for delay
     */
    private async delay(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /**
     * Get language name from code with caching to avoid N+1 queries
     */
    private async getLanguageName(code: string): Promise<string> {
        if (!code) {
            throw new Error('Language code is required');
        }

        const cached = this.languageNameCache.get(code);
        if (cached) {
            return cached;
        }

        const language = await this.languageRepository.findByCode(code);
        if (!language) {
            this.logger.warn(`Language not found for code: ${code}, using code as fallback`);
            return code;
        }

        this.languageNameCache.set(code, language.name);
        return language.name;
    }

    private parseEvaluationResponse(text: string): EvaluationResult {
        let jsonText = text.trim();
        if (jsonText.startsWith('```json')) {
            jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (jsonText.startsWith('```')) {
            jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }

        const parsed = JSON.parse(jsonText) as EvaluationResult;
        return parsed;
    }

    private parseDialogueResponse(text: string): {
        dialogue: Array<{ speaker: string; text: string }>;
        vocabWordsUsed: string[];
    } {
        let jsonText = text.trim();
        if (jsonText.startsWith('```json')) {
            jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (jsonText.startsWith('```')) {
            jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }

        return JSON.parse(jsonText) as {
            dialogue: Array<{ speaker: string; text: string }>;
            vocabWordsUsed: string[];
        };
    }
}
