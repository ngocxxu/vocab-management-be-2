import { AppLocale, DEFAULT_APP_LOCALE } from './locale.util';

/** Fixed user-facing texts. Add a key here instead of hardcoding a string in a service. */
const APP_MESSAGES = {
    correct: { en: 'Correct.', vi: 'Đúng.' },
    nearCorrect: { en: 'Near correct (typing error).', vi: 'Gần đúng (lỗi gõ).' },
    correctAnswerLabel: { en: 'Correct answer', vi: 'Đáp án đúng' },
    outOfScope: {
        en: 'Sorry, I can only help with app-related questions.',
        vi: 'Xin lỗi, tôi chỉ hỗ trợ các câu hỏi liên quan đến ứng dụng.',
    },
    chatFallback: {
        en: "I wasn't able to complete this in the allowed steps. Please try rephrasing.",
        vi: 'Tôi chưa hoàn thành được việc này trong số bước cho phép. Vui lòng thử diễn đạt lại.',
    },
    generationCancelled: { en: 'Generation cancelled.', vi: 'Đã dừng việc tạo nội dung.' },
    actionCancelled: { en: 'Action cancelled.', vi: 'Đã hủy thao tác.' },
} as const;

export type AppMessageKey = keyof typeof APP_MESSAGES;

export function appMessage(key: AppMessageKey, locale: AppLocale = DEFAULT_APP_LOCALE): string {
    return APP_MESSAGES[key][locale] ?? APP_MESSAGES[key][DEFAULT_APP_LOCALE];
}
