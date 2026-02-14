import { FeatureId } from '../types/features';

export enum AIProviderType {
    Local = 'local',
    Gemini = 'gemini',
    None = 'none'
}

export interface FeatureSettings {
    enabled: boolean;
    autopilot: boolean;
}

export interface SyncedSettings {
    customGroupingRules: string;
    geminiApiKey: string;
    hasCompletedOnboarding: boolean;
    features: Record<FeatureId, FeatureSettings>;
}

export interface LocalSettings {
    aiProvider: AIProviderType;
    aiModel: string;
}

export type AppSettings = SyncedSettings & LocalSettings;

export const DEFAULT_GROUPING_RULES = `- ALWAYS start group names with a relevant emoji (e.g., "🇯🇵Japan Trip", "⚛️React").
- Avoid generic names (e.g., don't use 'General', 'Miscellaneous', or 'Tabs').`;

export const DEFAULT_SYNCED_SETTINGS: SyncedSettings = {
    customGroupingRules: '',
    geminiApiKey: '',
    hasCompletedOnboarding: false,
    features: {
        [FeatureId.TabGrouper]: { enabled: false, autopilot: false },
        [FeatureId.DuplicateCleaner]: { enabled: true, autopilot: false }
    }
};

export const DEFAULT_LOCAL_SETTINGS: LocalSettings = {
    aiProvider: AIProviderType.None,
    aiModel: ''
};

export const DEFAULT_SETTINGS: AppSettings = {
    ...DEFAULT_SYNCED_SETTINGS,
    ...DEFAULT_LOCAL_SETTINGS
};

export type SettingsChanges = {
    [K in keyof AppSettings]?: chrome.storage.StorageChange;
};

const LOCAL_KEYS: (keyof LocalSettings)[] = ['aiProvider', 'aiModel'];

export const SettingsStorage = {
    get: async (resolveDefaults: boolean = true): Promise<AppSettings> => {
        const [syncItems, localItems] = await Promise.all([
            new Promise<Partial<SyncedSettings>>(resolve => {
                chrome.storage.sync.get(null, items => resolve(items as Partial<SyncedSettings>));
            }),
            new Promise<Partial<LocalSettings>>(resolve => {
                chrome.storage.local.get(null, items => resolve(items as Partial<LocalSettings>));
            })
        ]);

        const settings = {
            ...DEFAULT_SETTINGS,
            ...syncItems,
            ...localItems
        } as AppSettings;

        if (resolveDefaults && !settings.customGroupingRules) {
            settings.customGroupingRules = DEFAULT_GROUPING_RULES;
        }
        return settings;
    },

    set: async (settings: Partial<AppSettings>): Promise<void> => {
        const syncUpdates: Partial<SyncedSettings> = {};
        const localUpdates: Partial<LocalSettings> = {};

        // Helper to check if key is a local key
        const isLocalKey = (key: string): key is keyof LocalSettings => {
            return LOCAL_KEYS.includes(key as keyof LocalSettings);
        };

        (Object.keys(settings) as Array<keyof AppSettings>).forEach(key => {
            if (isLocalKey(key)) {
                (localUpdates as Record<string, unknown>)[key] = settings[key];
            } else {
                (syncUpdates as Record<string, unknown>)[key] = settings[key];
            }
        });

        const promises: Promise<void>[] = [];
        if (Object.keys(syncUpdates).length > 0) {
            promises.push(
                new Promise(resolve => {
                    chrome.storage.sync.set(syncUpdates, () => resolve());
                })
            );
        }
        if (Object.keys(localUpdates).length > 0) {
            promises.push(
                new Promise(resolve => {
                    chrome.storage.local.set(localUpdates, () => resolve());
                })
            );
        }

        await Promise.all(promises);
    },

    updateFeature: async (featureId: FeatureId, updates: Partial<FeatureSettings>): Promise<void> => {
        // 1. Get latest state (force read from storage)
        const settings = await SettingsStorage.get(false);
        const current = settings.features?.[featureId] || { enabled: false, autopilot: false };

        // 2. Prepare new state
        const next = { ...current, ...updates };

        // 3. Enforce Business Rules
        // ENFORCE RULE: If enabled becomes false, autopilot must be false
        if (updates.enabled === false) {
            next.autopilot = false;
        }
        // ENFORCE RULE: Autopilot cannot be true if enabled is false.
        if (updates.autopilot === true && !next.enabled) {
            next.enabled = true;
        }

        // 4. Merge back into full settings object
        const newFeatures = {
            ...settings.features,
            [featureId]: next
        };

        // 5. Write back
        await SettingsStorage.set({ features: newFeatures });
    },

    subscribe: (callback: (changes: SettingsChanges) => void): (() => void) => {
        const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
            if (areaName === 'sync' || areaName === 'local') {
                // We just pass the changes through. The consumer doesn't care source.
                callback(changes as SettingsChanges);
            }
        };

        chrome.storage.onChanged.addListener(handleStorageChange);
        return () => chrome.storage.onChanged.removeListener(handleStorageChange);
    }
};
