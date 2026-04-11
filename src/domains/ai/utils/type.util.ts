// Configuration interface for AI service
export interface AiServiceConfig {
    modelName: string;
    questionCount: number;
    passingScore: number;
    sourceQuestionProbability: number;
    maxRetries: number;
    retryDelayMs: number;
    models?: readonly string[];
}

export interface MultipleChoiceQuestion {
    correctAnswer: string;
    type: 'textSource' | 'textTarget';
    content: string;
    options: Array<{
        label: string;
        value: string;
    }>;
}

export interface EvaluationResult {
    sourceDialogue: string;
    missingIdeas: string[];
    overallScore: number;
    scores: {
        accuracy: number;
        fluency: number;
        register: number;
        completeness: number;
    };
    errors: Array<{
        index: number;
        span: string;
        type: 'omission' | 'addition' | 'wrong_lex' | 'tense' | 'register';
        explanation: string;
        suggestion: string;
    }>;
    correctedTranslation: string;
    advice: string[];
}
