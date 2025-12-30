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
}

export const DEFAULT_GROUPING_RULES = `- Never use generic group names like development, finance, coding.
- Never create groups simply by domain. Base on their contents instead, like search text, video names.`;

export const DEFAULT_SETTINGS: AppSettings = {
    customGroupingRules: DEFAULT_GROUPING_RULES,
    aiProvider: AIProviderType.None,
    aiModel: '',
    geminiApiKey: "",
    autopilot: {},
};

export const getSettings = async (): Promise<AppSettings> => {
    return new Promise((resolve) => {
        // Cast to any to satisfy the overload or use a partial object cast
        chrome.storage.sync.get(DEFAULT_SETTINGS as unknown as { [key: string]: any }, (items) => {
            resolve(items as unknown as AppSettings);
        });
    });
};

export const saveSettings = async (settings: Partial<AppSettings>): Promise<void> => {
    return new Promise((resolve) => {
        chrome.storage.sync.set(settings, () => resolve());
    });
};

