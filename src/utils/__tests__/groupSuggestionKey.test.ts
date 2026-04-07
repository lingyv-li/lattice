import { describe, it, expect } from 'vitest';
import { groupSuggestionKey } from '../groupSuggestionKey';

describe('groupSuggestionKey', () => {
    it('groupSuggestionCacheKey uses existing id when set', () => {
        expect(groupSuggestionKey('Work', 42)).toBe('existing-42');
    });

    it('groupSuggestionCacheKey uses new name when no existing id', () => {
        expect(groupSuggestionKey('Work', null)).toBe('new-Work');
        expect(groupSuggestionKey('Work', undefined)).toBe('new-Work');
    });
});
