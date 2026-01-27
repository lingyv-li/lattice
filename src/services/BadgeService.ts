import { StateService } from '../background/state';
import { updateWindowBadge } from '../utils/badge';
import { ErrorStorage } from '../utils/errorStorage';
import { AIProviderType, SettingsStorage } from '../utils/storage';
import { FeatureId } from '../types/features';
import { ProcessingState } from '../background/processing';

export class BadgeService {
    static async performBadgeUpdate(processingState: ProcessingState) {
        const settings = await SettingsStorage.get();

        // Check if Tab Grouper is enabled but no AI provider configured
        if (settings.features?.[FeatureId.TabGrouper]?.enabled && settings.aiProvider === AIProviderType.None) {
            // Show configuration needed badge on all windows
            const allWindows = await chrome.windows.getAll({ windowTypes: ['normal'] });
            for (const window of allWindows) {
                await updateWindowBadge(window.id!, false, 0, 0, false, '!', '#FFA500');
            }
            return;
        }

        // Check for global error
        const hasError = await ErrorStorage.hasErrors();

        const isProcessing = processingState.isProcessing;

        // Get all normal windows
        // populate: true to get tabs for filtering valid suggestion IDs
        const allWindows = await chrome.windows.getAll({ windowTypes: ['normal'], populate: true });

        // Count unique NEW groups per window (existingGroupId === null)
        for (const window of allWindows) {
            const windowId = window.id!;
            const validTabIds = new Set(window.tabs?.map(t => t.id).filter((id): id is number => id !== undefined) || []);

            const windowCache = await StateService.getSuggestionCache(windowId);
            const newGroupNames = new Set<string>();

            // Filter and count only valid suggestions
            for (const [tabId, cached] of windowCache.entries()) {
                if (!validTabIds.has(tabId)) continue;

                if (cached.groupName && cached.existingGroupId === null) {
                    newGroupNames.add(cached.groupName);
                }
            }

            // Asynchronously clean up stale cache entries
            StateService.pruneSuggestions(windowId, validTabIds).catch(console.error);

            const duplicateCount = await StateService.getDuplicateCount(windowId);
            await updateWindowBadge(windowId, isProcessing, newGroupNames.size, duplicateCount, hasError);
        }
    }
}
