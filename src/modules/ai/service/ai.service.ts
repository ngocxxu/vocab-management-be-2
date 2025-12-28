import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { Queue } from 'bullmq';
import { EReminderType } from '../../reminder/util';
import { CreateTextTargetInput } from '../../vocab/model/vocab.input';
import { VocabWithTextTargets, shuffleArray } from '../../vocab-trainer/util';
import { AudioEvaluationJobData } from '../processor/audio-evaluation.processor';
import { MultipleChoiceGenerationJobData } from '../processor/multiple-choice-generation.processor';
import { AiProviderFactory } from '../provider/ai-provider.factory';
import { AI_CONFIG, QUESTION_TYPES } from '../util/const.util';
import { EvaluationResult, MultipleChoiceQuestion } from '../util/type.util';
@Injectable()
export class AiService {
    private readonly logger = new Logger(AiService.name);

    public constructor(
        private readonly providerFactory: AiProviderFactory,
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
            const prompt = `
You are a language learning assistant. Translate a vocabulary word from ${sourceLanguageCode} to ${targetLanguageCode}.

Source text: "${textSource}"
Source language: ${sourceLanguageCode}
Target language: ${targetLanguageCode}

Task: Provide a complete translation with:
1. textTarget: the translated text in ${targetLanguageCode}
2. grammar: part of speech (noun, verb, adjective, adverb, interjection, preposition, conjunction, pronoun, determiner)
3. explanationSource: brief explanation of the word in ${sourceLanguageCode}
4. explanationTarget: brief explanation of the word in ${targetLanguageCode}
5. vocabExamples: array with 1 example showing usage in sentences

Format your response as JSON:
{
    "textTarget": "translated_word",
    "grammar": "part_of_speech",
    "explanationSource": "explanation in source language",
    "explanationTarget": "explanation in target language",
    "vocabExamples": [
        {
            "source": "example sentence with source word",
            "target": "example sentence with translated word"
        }
    ]
}

Return ONLY the JSON object, no markdown formatting, no code blocks, no additional text.
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

        const evaluationDetails = evaluations
            .map((evaluationItem, idx) => {
                const vocab = evaluationItem.vocab;
                const targetTexts = vocab.textTargets.map((tt) => tt.textTarget).join(', ');
                const questionContext =
                    evaluationItem.questionType === 'textSource'
                        ? `What is the translation of "${vocab.textSource}" in ${vocab.targetLanguageCode}?`
                        : `What is the translation of "${evaluationItem.systemAnswer}" in ${vocab.sourceLanguageCode}?`;

                return (
                    `${idx + 1}. Source language: ${vocab.sourceLanguageCode}, ` +
                    `Target language: ${vocab.targetLanguageCode}, ` +
                    `Source word: "${vocab.textSource}", Target word(s): "${targetTexts}", ` +
                    `Question: ${questionContext}, ` +
                    `Correct answer: "${evaluationItem.systemAnswer}", ` +
                    `Student's answer: "${evaluationItem.userAnswer}"`
                );
            })
            .join('\n\n');

        const prompt = `
You are a language learning assistant. Evaluate if students' answers are semantically correct and contextually appropriate.

Answer evaluations:
${evaluationDetails}

Task: Evaluate each answer and determine if it's semantically correct and contextually appropriate as a translation/meaning of the correct answer.

For each answer, consider:
1. Semantic equivalence (same meaning)
2. Contextual appropriateness
3. Acceptable variations (different forms, synonyms, etc.)
4. Common translation alternatives

Format your response as JSON array:
[
    {
        "answerIndex": 0,
        "isCorrect": true/false,
        "explanation": "brief explanation in Vietnamese of why the answer is correct or incorrect"
    },
    ...
]

Return ONLY the JSON array, no markdown formatting, no code blocks, no additional text.
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

    /**
     * Evaluate fill-in-blank answer using AI
     */
    public async evaluateFillInBlankAnswer(
        vocab: VocabWithTextTargets,
        userAnswer: string,
        systemAnswer: string,
        questionType: 'textSource' | 'textTarget',
        userId?: string,
        retryCount = 0,
    ): Promise<{ isCorrect: boolean; explanation?: string }> {
        try {
            const sourceLanguage = vocab.sourceLanguageCode;
            const targetLanguage = vocab.targetLanguageCode;
            const sourceText = vocab.textSource;
            const targetTexts = vocab.textTargets.map((tt) => tt.textTarget).join(', ');

            const isAskingSource = questionType === 'textSource';
            const questionContext = isAskingSource
                ? `What is the translation of "${sourceText}" in ${targetLanguage}?`
                : `What is the translation of "${systemAnswer}" in ${sourceLanguage}?`;

            const taskDesc =
                `Determine if the student's answer "${userAnswer}" is semantically correct ` +
                `and contextually appropriate as a translation/meaning of "${systemAnswer}" ` +
                'in the context of this vocabulary.';

            const prompt = `
You are a language learning assistant. Evaluate if a student's answer is semantically correct and contextually appropriate.

Context:
- Source language: ${sourceLanguage}
- Target language: ${targetLanguage}
- Source word: "${sourceText}"
- Target word(s): "${targetTexts}"
- Question: ${questionContext}
- Correct answer: "${systemAnswer}"
- Student's answer: "${userAnswer}"

Task: ${taskDesc}

Consider:
1. Semantic equivalence (same meaning)
2. Contextual appropriateness
3. Acceptable variations (different forms, synonyms, etc.)
4. Common translation alternatives

Format your response as JSON:
{
    "isCorrect": true/false,
    "explanation": "brief explanation by Vietnamese language of why the answer is correct or incorrect"
}

Return ONLY the JSON object, no markdown formatting, no code blocks, no additional text.
            `;

            const provider = await this.providerFactory.getProvider(userId);
            const text = await provider.generateContent(prompt, userId);

            const parsedResponse = this.parseFillInBlankEvaluationResponse(text);

            return {
                isCorrect: parsedResponse.isCorrect,
                explanation: parsedResponse.explanation,
            };
        } catch (error) {
            this.logger.error(
                `Error evaluating fill-in-blank answer for vocab ${vocab.id} (attempt ${
                    retryCount + 1
                }):`,
                error,
            );

            if (retryCount < AI_CONFIG.maxRetries) {
                this.logger.warn(`Retrying evaluation for vocab ${vocab.id}...`);
                await this.delay(AI_CONFIG.retryDelayMs * (retryCount + 1));
                return this.evaluateFillInBlankAnswer(
                    vocab,
                    userAnswer,
                    systemAnswer,
                    questionType,
                    userId,
                    retryCount + 1,
                );
            }

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
            sourceLanguage,
            targetLanguage,
            sourceWords,
            targetStyle,
            targetAudience,
            userId,
            retryCount = 0,
        } = params;

        try {
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
            const wordsList = targetLanguageWords.join(', ');
            const sourceWordsList = sourceLanguageWords.join(', ');
            const prompt = `
You are a language learning assistant. Generate a natural dialogue between two speakers (A and B) 
in ${targetLanguage} that incorporates ALL of the following vocabulary words naturally:

Vocabulary words (${targetLanguage}): ${wordsList}

Important context:
- This dialogue will be translated by the user from ${targetLanguage} to ${sourceLanguage}
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
     * Generate a single question for a vocabulary item
     */
    public async generateQuestionForVocab(
        vocab: VocabWithTextTargets,
        retryCount = 0,
        userId?: string,
    ): Promise<MultipleChoiceQuestion | null> {
        try {
            // Randomly choose whether to ask about source or target
            const isAskingSource = Math.random() < AI_CONFIG.sourceQuestionProbability;

            if (isAskingSource) {
                return await this.generateSourceQuestion(vocab, userId);
            } else {
                return await this.generateTargetQuestion(vocab, userId);
            }
        } catch (error) {
            this.logger.error(
                `Error generating question for vocab ${vocab.id} (attempt ${retryCount + 1}):`,
                error,
            );

            // Retry logic for transient errors
            if (retryCount < AI_CONFIG.maxRetries) {
                this.logger.warn(`Retrying question generation for vocab ${vocab.id}...`);
                await this.delay(AI_CONFIG.retryDelayMs * (retryCount + 1)); // Exponential backoff
                return this.generateQuestionForVocab(vocab, retryCount + 1);
            }

            return null;
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

        const vocabDetails = vocabItems
            .map((item, idx) => {
                const vocab = item.vocab;
                const targetTexts = vocab.textTargets.map((tt) => tt.textTarget).join(', ');
                const questionDirection =
                    item.questionType === 'source'
                        ? `What is the translation of "${vocab.textSource}" in ${vocab.targetLanguageCode}?`
                        : `What is the translation of "${item.selectedTarget}" in ${vocab.sourceLanguageCode}?`;
                const correctAnswer =
                    item.questionType === 'source' ? item.selectedTarget : vocab.textSource;

                return (
                    `${idx + 1}. Source: "${vocab.textSource}", Target(s): "${targetTexts}", ` +
                    `Languages: ${vocab.sourceLanguageCode} → ${vocab.targetLanguageCode}, ` +
                    `Question: ${questionDirection}, Correct Answer: "${correctAnswer}"`
                );
            })
            .join('\n');

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
     * Common method to generate question with prompt template
     */
    private async generateQuestionWithPrompt(
        promptData: {
            questionType: 'source' | 'target';
            sourceLanguage: string;
            targetLanguage: string;
            sourceText: string;
            targetText: string;
            correctAnswer: string;
            correctAnswerLabel: string;
        },
        userId?: string,
    ): Promise<{
        content: string;
        options: Array<{ label: string; value: string }>;
        correctAnswer: string;
    }> {
        const isSourceQuestion = promptData.questionType === 'source';
        const questionText = isSourceQuestion
            ? `What is the translation of '${promptData.sourceText}' in [target_language]?`
            : `What is the translation of '${promptData.targetText}' in [source_language]?`;

        const prompt = `
You are a language learning assistant. Generate a multiple choice question for vocabulary practice.

Context:
- Source language: ${promptData.sourceLanguage}
- Target language: ${promptData.targetLanguage}
- Source text: "${promptData.sourceText}"
- Target text: "${promptData.targetText}"
- Correct answer: "${promptData.correctAnswer}"

Task: Create a question asking "${questionText}"

Requirements:
1. The question should ask for the translation
2. Provide ${AI_CONFIG.questionCount} options (A, B, C, D)
3. One option should be the correct answer: "${promptData.correctAnswerLabel}"
4. Generate ${AI_CONFIG.questionCount - 1} plausible but incorrect options that are:
   - Similar length to the correct answer
   - Related to the same topic/context
   - Common words in the target language
   - Not obviously wrong

Format your response as JSON:
{
    "content": "${questionText}",
    "options": [
        {"label": "${promptData.correctAnswerLabel}", "value": "${promptData.correctAnswerLabel}"},
        {"label": "wrong_option_1", "value": "wrong_option_1"},
        {"label": "wrong_option_2", "value": "wrong_option_2"},
        {"label": "wrong_option_3", "value": "wrong_option_3"}
    ],
    "correctAnswer": "${promptData.correctAnswerLabel}"
}

Return ONLY the JSON object, no markdown formatting, no code blocks, no additional text.
        `;

        const provider = await this.providerFactory.getProvider(userId);
        const text = await provider.generateContent(prompt, userId);

        const parsedResponse = this.parseJsonResponse(text);

        const shuffledOptions = shuffleArray(parsedResponse.options);

        return {
            ...parsedResponse,
            options: shuffledOptions,
        };
    }

    /**
     * Parse JSON response from AI model
     */
    private parseJsonResponse(text: string): {
        content: string;
        options: Array<{ label: string; value: string }>;
        correctAnswer: string;
    } {
        let jsonText = text.trim();
        if (jsonText.startsWith('```json')) {
            jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (jsonText.startsWith('```')) {
            jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }

        return JSON.parse(jsonText) as {
            content: string;
            options: Array<{ label: string; value: string }>;
            correctAnswer: string;
        };
    }

    private parseFillInBlankEvaluationResponse(text: string): {
        isCorrect: boolean;
        explanation?: string;
    } {
        let jsonText = text.trim();
        if (jsonText.startsWith('```json')) {
            jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (jsonText.startsWith('```')) {
            jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }

        return JSON.parse(jsonText) as {
            isCorrect: boolean;
            explanation?: string;
        };
    }

    /**
     * Generate question asking for source text (answer is target)
     */
    private async generateSourceQuestion(
        vocab: VocabWithTextTargets,
        userId?: string,
    ): Promise<MultipleChoiceQuestion> {
        // Randomly select one target text as the correct answer
        const correctTarget =
            vocab.textTargets[Math.floor(Math.random() * vocab.textTargets.length)];

        const promptData = {
            questionType: 'source' as const,
            sourceLanguage: vocab.sourceLanguageCode,
            targetLanguage: vocab.targetLanguageCode,
            sourceText: vocab.textSource,
            targetText: correctTarget.textTarget,
            correctAnswer: correctTarget.textTarget,
            correctAnswerLabel: correctTarget.textTarget,
        };

        const parsedResponse = await this.generateQuestionWithPrompt(promptData, userId);

        return {
            correctAnswer: parsedResponse.correctAnswer,
            type: QUESTION_TYPES.TARGET,
            content: parsedResponse.content,
            options: parsedResponse.options,
        };
    }

    /**
     * Generate question asking for target text (answer is source)
     */
    private async generateTargetQuestion(
        vocab: VocabWithTextTargets,
        userId?: string,
    ): Promise<MultipleChoiceQuestion> {
        // Randomly select one target text
        const selectedTarget =
            vocab.textTargets[Math.floor(Math.random() * vocab.textTargets.length)];

        const promptData = {
            questionType: 'target' as const,
            sourceLanguage: vocab.sourceLanguageCode,
            targetLanguage: vocab.targetLanguageCode,
            sourceText: vocab.textSource,
            targetText: selectedTarget.textTarget,
            correctAnswer: vocab.textSource,
            correctAnswerLabel: vocab.textSource,
        };

        const parsedResponse = await this.generateQuestionWithPrompt(promptData, userId);

        return {
            correctAnswer: parsedResponse.correctAnswer,
            type: QUESTION_TYPES.SOURCE,
            content: parsedResponse.content,
            options: parsedResponse.options,
        };
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
