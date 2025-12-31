export enum AIProviderType {
    Local = 'local',
    Gemini = 'gemini',
    None = 'none'
}

export interface AppSettings {
    customGroupingRules: string;
    aiProvider: AIProviderType;
    aiModel: string;
    geminiApiKey: string;
    autopilot: Record<string, boolean>;
    selectedCards?: string[];
    processingDebounceDelay?: number;
}

export const DEFAULT_GROUPING_RULES = `- Never use generic group names like development, finance, coding.
- Never create groups simply by domain. Base on their contents instead, like search text, video names.`;

export const DEFAULT_SETTINGS: AppSettings = {
    customGroupingRules: DEFAULT_GROUPING_RULES,
    aiProvider: AIProviderType.None,
    aiModel: '',
    geminiApiKey: "",
    autopilot: {},
    processingDebounceDelay: 2000,
};

export type SettingsChanges = {
    [K in keyof AppSettings]?: chrome.storage.StorageChange;
};

export const SettingsStorage = {
    get: async (): Promise<AppSettings> => {
        return new Promise((resolve) => {
            chrome.storage.sync.get(DEFAULT_SETTINGS as unknown as { [key: string]: any }, (items) => {
                resolve(items as unknown as AppSettings);
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


