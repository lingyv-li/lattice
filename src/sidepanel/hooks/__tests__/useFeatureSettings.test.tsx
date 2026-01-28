import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFeatureSettings } from '../useFeatureSettings';
import { SettingsStorage, DEFAULT_SETTINGS } from '../../../utils/storage';
import { FeatureId } from '../../../types/features';

// Mock SettingsStorage
vi.mock('../../../utils/storage', async () => {
    const actual = await vi.importActual('../../../utils/storage');
    return {
        ...actual,
        SettingsStorage: {
            get: vi.fn(),
            set: vi.fn(),
            subscribe: vi.fn(),
            updateFeature: vi.fn() // The new method we added
        }
    };
});

describe('useFeatureSettings', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Default get
        vi.mocked(SettingsStorage.get).mockResolvedValue(DEFAULT_SETTINGS);
        // Default subscribe
        vi.mocked(SettingsStorage.subscribe).mockReturnValue(() => {});
        // Default updateFeature
        vi.mocked(SettingsStorage.updateFeature).mockResolvedValue(undefined);
    });

    it('should NOT write to storage on mount (fix for initialization stomp)', async () => {
        // Render the hook
        renderHook(() => useFeatureSettings());

        // Wait for potential effects
        await new Promise(resolve => setTimeout(resolve, 0));

        // Verify NO SET or UPDATE calls happened just by mounting
        expect(SettingsStorage.set).not.toHaveBeenCalled();
        expect(SettingsStorage.updateFeature).not.toHaveBeenCalled();
    });

    it('should call updateFeature when a feature is updated', async () => {
        const { result } = renderHook(() => useFeatureSettings());

        // Wait for initial load
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 0));
        });

        // Trigger update
        await act(async () => {
            result.current.updateFeature(FeatureId.TabGrouper, { enabled: true });
        });

        // Verify it called the correct storage method
        expect(SettingsStorage.updateFeature).toHaveBeenCalledWith(FeatureId.TabGrouper, {
            enabled: true
        });
    });

    it('should optimistically update local state', async () => {
        // Setup initial state where TabGrouper is disabled
        const initialFeatures = {
            [FeatureId.TabGrouper]: { enabled: false, autopilot: false },
            [FeatureId.DuplicateCleaner]: { enabled: true, autopilot: false }
        };

        vi.mocked(SettingsStorage.get).mockResolvedValue({
            ...DEFAULT_SETTINGS,
            features: initialFeatures
        });

        const { result } = renderHook(() => useFeatureSettings());

        // Wait for load
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 0));
        });

        expect(result.current.features[FeatureId.TabGrouper].enabled).toBe(false);

        // Update
        await act(async () => {
            result.current.updateFeature(FeatureId.TabGrouper, { enabled: true });
        });

        // Verify local state updated immediately
        expect(result.current.features[FeatureId.TabGrouper].enabled).toBe(true);
    });

    it('should enforce autopilot logic in local optimistic state', async () => {
        const { result } = renderHook(() => useFeatureSettings());

        await act(async () => {
            await new Promise(r => setTimeout(r, 0));
        });

        // Turn on autopilot (which should force enabled=true)
        await act(async () => {
            // Start from disabled
            // Assume current default is enabled=false for TabGrouper (it is in our mock usually)
            // But let's verify logic by forcing autopilot=true
            result.current.updateFeature(FeatureId.TabGrouper, { autopilot: true });
        });

        // Local state should reflect the enforced rule
        expect(result.current.features[FeatureId.TabGrouper].enabled).toBe(true);
        expect(result.current.features[FeatureId.TabGrouper].autopilot).toBe(true);
    });
});
