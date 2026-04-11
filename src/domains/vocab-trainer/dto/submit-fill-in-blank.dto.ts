import { SubmitExamBodyInput } from './submit-exam.dto';

export type WordTestInput = { userAnswer: string; systemAnswer: string };

export class SubmitFillInBlankInput extends SubmitExamBodyInput {}
