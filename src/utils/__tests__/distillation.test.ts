import { describe, it, expect, vi, beforeEach } from 'vitest';
import { distillRejections, processDistillation } from '../distillation';
import type { RejectionSnapshot } from '../../types/rejection';
import type { AIProvider } from '../../services/ai/types';

vi.mock('../rejectionMemory', () => ({
    popPendingRejections: vi.fn(),
    getLearnedPreferences: vi.fn().mockResolvedValue(''),
    setLearnedPreferences: vi.fn(),
    LEARNED_PREFERENCES_MAX_LENGTH: 500
}));

import { popPendingRejections, getLearnedPreferences, setLearnedPreferences } from '../rejectionMemory';

const makeProvider = (canSummarize: boolean, response = ''): AIProvider => ({
    id: 'test',
    canSummarize,
    summarize: vi.fn().mockResolvedValue(response),
    generateSuggestions: vi.fn() as AIProvider['generateSuggestions']
});

const snap: RejectionSnapshot = {
    groupName: 'Work',
    tabs: [
        { title: 'PR #45', hostname: 'github.com' },
        { title: 'useEffect docs', hostname: 'react.dev' }
    ],
    timestamp: '2026-01-01T00:00:00.000Z'
};

const signal = new AbortController().signal;

describe('distillRejections', () => {
    it('returns empty string for local provider', async () => {
        const provider = makeProvider(false);
        expect(await distillRejections([snap], provider, signal)).toBe('');
    });

    it('returns empty string for empty rejections', async () => {
        const provider = makeProvider(true, '- Some rule.');
        expect(await distillRejections([], provider, signal)).toBe('');
    });

    it('calls summarize with formatted prompt and returns trimmed result', async () => {
        const provider = makeProvider(true, '  - Keep PRs separate from docs.  ');
        const result = await distillRejections([snap], provider, signal);
        expect(result).toBe('- Keep PRs separate from docs.');
        expect(provider.summarize).toHaveBeenCalledWith(expect.stringContaining('Group "Work"'), signal);
        expect(provider.summarize).toHaveBeenCalledWith(expect.stringContaining('github.com'), signal);
    });
});

describe('processDistillation', () => {
    beforeEach(() => {
        vi.mocked(popPendingRejections).mockResolvedValue([snap]);
        vi.mocked(getLearnedPreferences).mockResolvedValue('');
        vi.mocked(setLearnedPreferences).mockResolvedValue(undefined);
    });

    it('does nothing when no pending rejections', async () => {
        vi.mocked(popPendingRejections).mockResolvedValue([]);
        const provider = makeProvider(true, '- A rule.');
        await processDistillation(provider, signal);
        expect(setLearnedPreferences).not.toHaveBeenCalled();
    });

    it('does nothing when provider cannot summarize', async () => {
        const provider = makeProvider(false);
        await processDistillation(provider, signal);
        expect(setLearnedPreferences).not.toHaveBeenCalled();
    });

    it('stores new rules when under budget', async () => {
        const provider = makeProvider(true, '- Keep PRs separate from docs.');
        await processDistillation(provider, signal);
        expect(setLearnedPreferences).toHaveBeenCalledWith('- Keep PRs separate from docs.');
    });

    it('appends to existing preferences when combined is under budget', async () => {
        vi.mocked(getLearnedPreferences).mockResolvedValue('- Existing rule.');
        const provider = makeProvider(true, '- New rule.');
        await processDistillation(provider, signal);
        expect(setLearnedPreferences).toHaveBeenCalledWith('- Existing rule.\n- New rule.');
    });

    it('compresses when combined exceeds budget', async () => {
        const longExisting = '- ' + 'x'.repeat(490);
        vi.mocked(getLearnedPreferences).mockResolvedValue(longExisting);
        const provider = makeProvider(true, '- New rule.');
        (provider.summarize as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce('- New rule.')      // distill call
            .mockResolvedValueOnce('- Compressed.');   // compress call
        await processDistillation(provider, signal);
        expect(provider.summarize).toHaveBeenCalledTimes(2);
        expect(setLearnedPreferences).toHaveBeenCalledWith('- Compressed.');
    });
});
