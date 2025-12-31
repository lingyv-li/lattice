import { ApiError } from '@google/genai';

export const getUserFriendlyError = (error: any): string => {
    // 1. Quota Error
    const isQuotaError = (error instanceof ApiError && error.status === 429) ||
        JSON.stringify(error).includes("429") ||
        (error?.message && (error.message.includes("429") || error.message.includes("Quota exceeded")));

    if (isQuotaError) {
        return 'Gemini API Quota Exceeded. Please try again later.';
    }

    // 2. Generic fallback
    if (error && error.message) {
        return error.message;
    }

    return 'An unexpected error occurred.';
};
