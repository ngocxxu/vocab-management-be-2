import { LanguageFolderNotFoundException } from '@/domains/catalog/language-folder/exceptions/language-folder-not-found.exception';
import { PlanQuotaExceededException } from '@/domains/catalog/plan/exceptions/plan-quota-exceeded.exception';
import { VocabFolderLanguageMismatchException, VocabInUseException, VocabNotFoundException, type TVocabInUse } from '@/domains/vocab/exceptions';
import { Prisma } from '@prisma/client';

import { MCP_ERROR_CODES, McpErrorCode } from '../constants';
import { McpToolException } from '../exceptions';

export interface ToolFailure {
    code: McpErrorCode;
    message: string;
}

/**
 * Maps a domain error to the stable code the client sees. Returns null for anything else, and the caller reports that as `internal_error`.
 * The messages are written for the model: they name the tool to call next and carry no database details.
 */
export function toToolFailure(error: unknown): ToolFailure | null {
    if (error instanceof McpToolException) {
        return { code: error.code, message: error.message };
    }
    if (error instanceof PlanQuotaExceededException) {
        return { code: MCP_ERROR_CODES.QUOTA_EXCEEDED, message: error.message };
    }
    if (error instanceof VocabInUseException) {
        return { code: MCP_ERROR_CODES.VOCAB_IN_USE, message: describeTrainers(error) };
    }
    if (error instanceof VocabNotFoundException) {
        return { code: MCP_ERROR_CODES.VOCAB_NOT_FOUND, message: 'Vocab not found. Call list_vocab to get a valid id.' };
    }
    if (error instanceof LanguageFolderNotFoundException) {
        return { code: MCP_ERROR_CODES.FOLDER_NOT_FOUND, message: 'Language folder not found. Call list_folders to get a valid id.' };
    }
    if (error instanceof VocabFolderLanguageMismatchException) {
        return { code: MCP_ERROR_CODES.FOLDER_LANGUAGE_MISMATCH, message: error.message };
    }
    return null;
}

/** Runs a vocab write and turns the unique-key clash on (text, languages, folder) into `duplicate_vocab`. */
export async function withDuplicateVocabCheck<T>(write: Promise<T>): Promise<T> {
    try {
        return await write;
    } catch (error: unknown) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            throw new McpToolException(MCP_ERROR_CODES.DUPLICATE_VOCAB, 'This word already exists in that folder.');
        }
        throw error;
    }
}

function describeTrainers(error: VocabInUseException): string {
    const { details } = error.getResponse() as { details?: { vocabs?: TVocabInUse[] } };
    const names = (details?.vocabs ?? []).flatMap((vocab) => vocab.sampleTrainers.map((trainer) => trainer.name));
    return names.length > 0 ? `Word is still in trainer(s): ${names.join(', ')}. Remove it from them first.` : 'Word is still in a trainer. Remove it from the trainer first.';
}
