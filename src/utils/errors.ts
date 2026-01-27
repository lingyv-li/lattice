import { AIProviderError, ConfigurationError, NetworkError } from './AppError';
import { ApiError } from '@google/genai';

export const getUserFriendlyError = (error: unknown): string => {
    if (!error) return 'An unknown error occurred';

    // Handle Typed Errors
    if (error instanceof ConfigurationError) {
        if (error.message === 'AI Provider is disabled.') {
            return 'Configure an AI provider in Settings to enable tab grouping';
        }
        if (error.message.includes('API Key is missing')) {
            return 'Invalid Gemini API key. Check your API key in Settings.';
        }
        return error.message;
    }

    if (error instanceof AIProviderError) {
        if (error.message.includes('not available')) {
            return 'Local AI is not available in this browser. Try using Gemini instead.';
        }
        return error.message;
    }

    if (error instanceof NetworkError) {
        return 'Network connection failed. Please check your internet.';
    }

    // Fallback for legacy or unknown errors
    const message = error instanceof Error ? error.message : String(error);

    // Gemini API errors (often come as raw errors from SDK)
    if (message.includes('API key')) {
        return 'Invalid Gemini API key. Check your API key in Settings.';
    }

    if ((error as ApiError)?.status === 429) {
        return 'Gemini API quota exceeded. Try again later or use Local AI.';
    }

    // Default to original message
    return message;
};
