export interface AppSettings {
    scanMissing: boolean;
    scanInterrupted: boolean;
    customGroupingRules: string;
    aiProvider: 'local' | 'gemini';
    aiModel: string;
    geminiApiKey: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
    scanMissing: true,
    scanInterrupted: true,
    customGroupingRules: "",
    aiProvider: 'local',
    aiModel: '',
    geminiApiKey: "",
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

