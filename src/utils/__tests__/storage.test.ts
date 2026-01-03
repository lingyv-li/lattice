import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SettingsStorage, DEFAULT_GROUPING_RULES, AIProviderType } from '../storage';

// Mock chrome.storage
const mockSyncGet = vi.fn();
const mockSyncSet = vi.fn();
const mockLocalGet = vi.fn();
const mockLocalSet = vi.fn();

global.chrome = {
    storage: {
        sync: {
            get: mockSyncGet,
            set: mockSyncSet
        },
        local: {
            get: mockLocalGet,
            set: mockLocalSet
        },
        onChanged: {
            addListener: vi.fn(),
            removeListener: vi.fn()
        }
    }
} as unknown as typeof chrome;

describe('SettingsStorage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Default mocks
        mockSyncGet.mockImplementation((_keys, callback) => callback({}));
        mockLocalGet.mockImplementation((_keys, callback) => callback({}));
        mockSyncSet.mockImplementation((_data, callback) => callback?.());
        mockLocalSet.mockImplementation((_data, callback) => callback?.());
    });

    it('should return default rules when custom rules are empty and resolveDefaults is true (default)', async () => {
        const settings = await SettingsStorage.get();
        expect(settings.customGroupingRules).toBe(DEFAULT_GROUPING_RULES);
    });

    it('should return default rules when custom rules are explicitly empty string and resolveDefaults is true', async () => {
        mockSyncGet.mockImplementation((_keys, callback) => {
            callback({ customGroupingRules: "" });
        });

        const settings = await SettingsStorage.get(true);
        expect(settings.customGroupingRules).toBe(DEFAULT_GROUPING_RULES);
    });

    it('should return empty string when custom rules are empty and resolveDefaults is false', async () => {
        const settings = await SettingsStorage.get(false);
        expect(settings.customGroupingRules).toBe("");
    });

    it('should return custom rules when they exist, regardless of resolveDefaults', async () => {
        const customRules = "My Context Rule";
        mockSyncGet.mockImplementation((_keys, callback) => {
            callback({ customGroupingRules: customRules });
        });

        const settingsTrue = await SettingsStorage.get(true);
        expect(settingsTrue.customGroupingRules).toBe(customRules);

        const settingsFalse = await SettingsStorage.get(false);
        expect(settingsFalse.customGroupingRules).toBe(customRules);
    });

    it('should split settings between sync and local storage on set', async () => {
        await SettingsStorage.set({
            customGroupingRules: 'New Rule',
            aiProvider: AIProviderType.Local,
            aiModel: 'nano'
        });

        // Verify sync received rules
        expect(mockSyncSet).toHaveBeenCalledWith(
            expect.objectContaining({ customGroupingRules: 'New Rule' }),
            expect.any(Function)
        );
        expect(mockSyncSet).not.toHaveBeenCalledWith(
            expect.objectContaining({ aiProvider: expect.anything() }),
            expect.anything()
        );

        // Verify local received AI settings
        expect(mockLocalSet).toHaveBeenCalledWith(
            expect.objectContaining({ aiProvider: AIProviderType.Local, aiModel: 'nano' }),
            expect.any(Function)
        );
        expect(mockLocalSet).not.toHaveBeenCalledWith(
            expect.objectContaining({ customGroupingRules: expect.anything() }),
            expect.anything()
        );
    });
});
