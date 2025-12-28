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

// ===== Tab Grouper Storage =====
import { TabSuggestionCache } from '../types/tabGrouper';

export interface TabGrouperStorage {
    suggestionCache: TabSuggestionCache[];
    rejectedTabs: number[];
}

const LOCAL_KEYS: (keyof TabGrouperStorage)[] = ['suggestionCache', 'rejectedTabs'];

export class StorageManager {
    static async getLocal(): Promise<Partial<TabGrouperStorage>> {
        return await chrome.storage.local.get(LOCAL_KEYS) as Partial<TabGrouperStorage>;
    }

    static async setLocal(data: Partial<TabGrouperStorage>): Promise<void> {
        await chrome.storage.local.set(data);
    }

    static async clearLocal(): Promise<void> {
        await chrome.storage.local.remove(LOCAL_KEYS);
    }
}
