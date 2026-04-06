import type { RejectionSnapshot } from '../types/rejection';
import type { AppSettings } from './storage';
import { DEFAULT_GROUPING_RULES } from './storage';

const PENDING_REJECTIONS_KEY = 'pendingRejections';
const LEARNED_PREFERENCES_KEY = 'learnedPreferences';
const MAX_PENDING = 20;
export const LEARNED_PREFERENCES_MAX_LENGTH = 500;

export async function storePendingRejection(snapshot: RejectionSnapshot): Promise<void> {
    const result = await chrome.storage.session.get(PENDING_REJECTIONS_KEY);
    const list: RejectionSnapshot[] = Array.isArray(result[PENDING_REJECTIONS_KEY]) ? result[PENDING_REJECTIONS_KEY] : [];
    list.push(snapshot);
    await chrome.storage.session.set({ [PENDING_REJECTIONS_KEY]: list.slice(-MAX_PENDING) });
}

export async function popPendingRejections(): Promise<RejectionSnapshot[]> {
    const result = await chrome.storage.session.get(PENDING_REJECTIONS_KEY);
    const list: RejectionSnapshot[] = Array.isArray(result[PENDING_REJECTIONS_KEY]) ? result[PENDING_REJECTIONS_KEY] : [];
    if (list.length > 0) {
        await chrome.storage.session.remove(PENDING_REJECTIONS_KEY);
    }
    return list;
}

export async function getLearnedPreferences(): Promise<string> {
    const result = await chrome.storage.local.get(LEARNED_PREFERENCES_KEY);
    const raw = result[LEARNED_PREFERENCES_KEY];
    return typeof raw === 'string' ? raw : '';
}

export async function setLearnedPreferences(prefs: string): Promise<void> {
    await chrome.storage.local.set({ [LEARNED_PREFERENCES_KEY]: prefs });
}

export async function clearLearnedPreferences(): Promise<void> {
    await chrome.storage.local.remove(LEARNED_PREFERENCES_KEY);
}

export async function getEffectiveRules(settings: AppSettings): Promise<string> {
    const baseRules = settings.customGroupingRules?.trim() || DEFAULT_GROUPING_RULES;
    const learned = await getLearnedPreferences();
    if (learned.trim()) {
        return `${baseRules}\n\n## Learned from your usage\n${learned.trim()}`;
    }
    return baseRules;
}
