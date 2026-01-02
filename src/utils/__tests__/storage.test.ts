import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SettingsStorage, DEFAULT_GROUPING_RULES } from '../storage';

// Mock chrome.storage
const mockGet = vi.fn();
const mockSet = vi.fn();

global.chrome = {
    storage: {
        sync: {
            get: mockGet,
            set: mockSet
        }
    }
} as unknown as typeof chrome;

describe('SettingsStorage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return default rules when custom rules are empty and resolveDefaults is true (default)', async () => {
        // Mock empty storage (so it uses DEFAULT_SETTINGS which now has empty string)
        mockGet.mockImplementation((_keys, callback: (items: Record<string, unknown>) => void) => {
            callback({});
        });

        const settings = await SettingsStorage.get();
        expect(settings.customGroupingRules).toBe(DEFAULT_GROUPING_RULES);
    });

    it('should return default rules when custom rules are explicitly empty string and resolveDefaults is true', async () => {
        mockGet.mockImplementation((_keys, callback: (items: Record<string, unknown>) => void) => {
            callback({ customGroupingRules: "" });
        });

        const settings = await SettingsStorage.get(true);
        expect(settings.customGroupingRules).toBe(DEFAULT_GROUPING_RULES);
    });

    it('should return empty string when custom rules are empty and resolveDefaults is false', async () => {
        mockGet.mockImplementation((_keys, callback: (items: Record<string, unknown>) => void) => {
            callback({});
        });

        const settings = await SettingsStorage.get(false);
        expect(settings.customGroupingRules).toBe("");
    });

    it('should return custom rules when they exist, regardless of resolveDefaults', async () => {
        const customRules = "My Context Rule";
        mockGet.mockImplementation((_keys, callback: (items: Record<string, unknown>) => void) => {
            callback({ customGroupingRules: customRules });
        });

        const settingsTrue = await SettingsStorage.get(true);
        expect(settingsTrue.customGroupingRules).toBe(customRules);

        const settingsFalse = await SettingsStorage.get(false);
        expect(settingsFalse.customGroupingRules).toBe(customRules);
    });
});
