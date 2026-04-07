import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    storePendingRejection,
    popPendingRejections,
    getLearnedPreferences,
    setLearnedPreferences,
    clearLearnedPreferences,
    getEffectiveRules,
    LEARNED_PREFERENCES_MAX_LENGTH
} from '../rejectionMemory';
import type { RejectionSnapshot } from '../../types/rejection';
import { DEFAULT_GROUPING_RULES } from '../storage';
import type { AppSettings } from '../storage';

const mockSessionGet = vi.fn();
const mockSessionSet = vi.fn();
const mockSessionRemove = vi.fn();
const mockLocalGet = vi.fn();
const mockLocalSet = vi.fn();
const mockLocalRemove = vi.fn();

beforeEach(() => {
    vi.clearAllMocks();
    mockSessionGet.mockResolvedValue({});
    mockSessionSet.mockResolvedValue(undefined);
    mockSessionRemove.mockResolvedValue(undefined);
    mockLocalGet.mockResolvedValue({});
    mockLocalSet.mockResolvedValue(undefined);
    mockLocalRemove.mockResolvedValue(undefined);
    const g = global as unknown as { chrome: unknown };
    g.chrome = {
        storage: {
            session: { get: mockSessionGet, set: mockSessionSet, remove: mockSessionRemove },
            local: { get: mockLocalGet, set: mockLocalSet, remove: mockLocalRemove }
        }
    };
});

const snap: RejectionSnapshot = {
    groupName: 'Work',
    tabs: [{ title: 'PR #1', hostname: 'github.com' }],
    timestamp: '2026-01-01T00:00:00.000Z'
};

describe('storePendingRejection', () => {
    it('appends to empty list', async () => {
        mockSessionGet.mockResolvedValue({ pendingRejections: [] });
        await storePendingRejection(snap);
        expect(mockSessionSet).toHaveBeenCalledWith({ pendingRejections: [snap] });
    });

    it('prunes to max 20', async () => {
        const existing = Array.from({ length: 20 }, (_, i) => ({ ...snap, groupName: `G${i}` }));
        mockSessionGet.mockResolvedValue({ pendingRejections: existing });
        await storePendingRejection(snap);
        const saved = mockSessionSet.mock.calls[0][0].pendingRejections as RejectionSnapshot[];
        expect(saved.length).toBe(20);
        expect(saved[saved.length - 1]?.groupName).toBe('Work');
    });
});

describe('popPendingRejections', () => {
    it('returns list and removes from storage', async () => {
        mockSessionGet.mockResolvedValue({ pendingRejections: [snap] });
        const result = await popPendingRejections();
        expect(result).toEqual([snap]);
        expect(mockSessionRemove).toHaveBeenCalledWith('pendingRejections');
    });

    it('returns empty array when nothing stored', async () => {
        const result = await popPendingRejections();
        expect(result).toEqual([]);
        expect(mockSessionRemove).not.toHaveBeenCalled();
    });
});

describe('getLearnedPreferences / setLearnedPreferences / clearLearnedPreferences', () => {
    it('returns empty string by default', async () => {
        expect(await getLearnedPreferences()).toBe('');
    });

    it('round-trips through set/get', async () => {
        mockLocalGet.mockResolvedValue({ learnedPreferences: '- Keep code separate from docs.' });
        expect(await getLearnedPreferences()).toBe('- Keep code separate from docs.');
    });

    it('calls storage.local.set with the given value', async () => {
        await setLearnedPreferences('- Keep work separate.');
        expect(mockLocalSet).toHaveBeenCalledWith({ learnedPreferences: '- Keep work separate.' });
    });

    it('clearLearnedPreferences removes the key', async () => {
        await clearLearnedPreferences();
        expect(mockLocalRemove).toHaveBeenCalledWith('learnedPreferences');
    });
});

describe('constants', () => {
    it('LEARNED_PREFERENCES_MAX_LENGTH equals 500', () => {
        expect(LEARNED_PREFERENCES_MAX_LENGTH).toBe(500);
    });
});

describe('getEffectiveRules', () => {
    it('returns default rules when customGroupingRules is empty and no learned prefs', async () => {
        const settings = { customGroupingRules: '' } as AppSettings;
        expect(await getEffectiveRules(settings)).toBe(DEFAULT_GROUPING_RULES);
    });

    it('returns custom rules when set', async () => {
        const settings = { customGroupingRules: 'My rules.' } as AppSettings;
        expect(await getEffectiveRules(settings)).toBe('My rules.');
    });

    it('appends learned preferences when present', async () => {
        mockLocalGet.mockResolvedValue({ learnedPreferences: '- No mixing docs with PRs.' });
        const settings = { customGroupingRules: 'My rules.' } as AppSettings;
        const result = await getEffectiveRules(settings);
        expect(result).toContain('My rules.');
        expect(result).toContain('## Learned from your usage');
        expect(result).toContain('- No mixing docs with PRs.');
    });
});
