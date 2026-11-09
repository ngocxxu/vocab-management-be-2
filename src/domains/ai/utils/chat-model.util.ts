import { ConfigService } from '@/domains/platform/config/services';

/** The `ai.chat.model` setting when it holds text, else whatever `fallback` returns (the provider's regular model). */
export const readChatModel = async (configService: ConfigService, userId: string | undefined, fallback: () => Promise<string>): Promise<string> => {
    const configValue = await configService.getConfig(userId || null, 'ai.chat.model');
    return typeof configValue === 'string' && configValue.trim().length > 0 ? configValue : fallback();
};
