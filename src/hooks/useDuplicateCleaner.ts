import { useState, useEffect } from 'react';
import { DuplicateCloser } from '../services/duplicates';
import { OrganizerStatus } from '../types/organizer';
import { StateService } from '../background/state';

export const useDuplicateCleaner = () => {
    const [status, setStatus] = useState<OrganizerStatus>(OrganizerStatus.Idle);
    const [closedCount, setClosedCount] = useState<number>(0);
    const [duplicateCount, setDuplicateCount] = useState<number>(0);

    useEffect(() => {
        let unsubscribe: (() => void) | undefined;

        const init = async () => {
            const window = await chrome.windows.getCurrent();
            const windowId = window.id!;

            // Hydrate logic if needed, but StateService handles it.
            // We just need to ensure StateService is hydrated or listens.
            // StateService.hydrate() is conceptually for background startup.
            // But we can blindly subscribe. The callback gives us latest data.
            // Also fetch initial value.

            // Note: StateService loads from storage.session.
            // We should ensure we get the stored value.
            const count = await StateService.getDuplicateCount(windowId);
            setDuplicateCount(count);

            unsubscribe = StateService.subscribe(windowId, (_cache, _isProcessing, newDuplicateCount) => {
                setDuplicateCount(newDuplicateCount);
            });
        };

        init();

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, []);

    const closeDuplicates = async () => {
        setStatus(OrganizerStatus.Applying);

        try {
            const result = await DuplicateCloser.closeDuplicates();

            if (result.closedCount > 0) {
                setClosedCount(result.closedCount);
                setStatus(OrganizerStatus.Success);
            } else {
                setStatus(OrganizerStatus.Idle);
            }

            // No need to manual scan, background will update StateService

            setTimeout(() => {
                setStatus(OrganizerStatus.Idle);
                setClosedCount(0);
            }, 3000);

        } catch (err: unknown) {
            console.error('Failed to clean duplicates:', err);
            setStatus(OrganizerStatus.Error);
            setTimeout(() => setStatus(OrganizerStatus.Idle), 3000);
        }
    };

    return {
        status,
        closedCount,
        duplicateCount,
        closeDuplicates
    };
};
