import { describe, it, expect } from 'vitest';
import { AppError, AIProviderError, NetworkError, ConfigurationError } from '../AppError';
import { getUserFriendlyError } from '../errors';

describe('AppError', () => {
    it('should correctly capture the message and original error', () => {
        const original = new Error('Original error');
        const error = new AppError('Custom message', original);

        expect(error.message).toBe('Custom message');
        expect(error.originalError).toBe(original);
        expect(error.name).toBe('AppError');
        expect(error).toBeInstanceOf(Error);
    });
});

describe('AIProviderError', () => {
    it('should be instance of AppError', () => {
        const error = new AIProviderError('AI failed');
        expect(error).toBeInstanceOf(AppError);
        expect(error).toBeInstanceOf(AIProviderError);
    });
});

describe('getUserFriendlyError', () => {
    it('should handle ConfigurationError', () => {
        const error = new ConfigurationError('AI Provider is disabled.');
        expect(getUserFriendlyError(error)).toBe('Configure an AI provider in Settings to enable tab grouping');
    });

    it('should handle AIProviderError for Local AI unavailability', () => {
        const error = new AIProviderError('Local AI is not available.');
        expect(getUserFriendlyError(error)).toContain('Local AI is not available in this browser');
    });

    it('should handle NetworkError', () => {
        const error = new NetworkError('Connection lost');
        expect(getUserFriendlyError(error)).toBe('Network connection failed. Please check your internet.');
    });

    it('should fall back to message for unknown errors', () => {
        const error = new Error('Random system error');
        expect(getUserFriendlyError(error)).toBe('Random system error');
    });

    it('should handle legacy string matching for Gemini API keys', () => {
        const error = new Error('Some Google API error: API key not valid');
        expect(getUserFriendlyError(error)).toBe('Invalid Gemini API key. Check your API key in Settings.');
    });

    it('should handle Gemini 429 error by status code', () => {
        const error = { message: 'Some other error', status: 429, name: 'RateLimitError' };
        expect(getUserFriendlyError(error)).toBe('Gemini API quota exceeded. Try again later or use Local AI.');
    });
});
