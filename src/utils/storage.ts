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

export interface AppSettings {
    customGroupingRules: string;
    aiProvider: AIProviderType;
    aiModel: string;
    geminiApiKey: string;
    // Unified Feature State
    features: Record<FeatureId, FeatureSettings>;
    processingDebounceDelay?: number;
}

export const DEFAULT_GROUPING_RULES = `- ALWAYS start group names with a relevant emoji (e.g., 🗼Travel, ⚛️React).
- Avoid generic names (e.g., don't use 'General', 'Miscellaneous', or 'Tabs').`;

export const DEFAULT_SETTINGS: AppSettings = {
    customGroupingRules: DEFAULT_GROUPING_RULES,
    aiProvider: AIProviderType.None,
    aiModel: '',
    geminiApiKey: "",
    features: {
        [FeatureId.TabGrouper]: { enabled: true, autopilot: false },
        [FeatureId.DuplicateCleaner]: { enabled: true, autopilot: false }
    },
    processingDebounceDelay: 2000,
};

export type SettingsChanges = {
    [K in keyof AppSettings]?: chrome.storage.StorageChange;
};

export const SettingsStorage = {
    get: async (): Promise<AppSettings> => {
        return new Promise((resolve) => {
            chrome.storage.sync.get(null, (items) => {
                const settings = { ...DEFAULT_SETTINGS, ...items } as AppSettings;
                resolve(settings);
            });
        });
    },

    set: async (settings: Partial<AppSettings>): Promise<void> => {
        return new Promise((resolve) => {
            chrome.storage.sync.set(settings, () => resolve());
        });
    },

    subscribe: (callback: (changes: SettingsChanges) => void): () => void => {
        const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
            if (areaName === 'sync') {
                callback(changes as SettingsChanges);
            }
        };

        chrome.storage.onChanged.addListener(handleStorageChange);
        return () => chrome.storage.onChanged.removeListener(handleStorageChange);
    }
};


