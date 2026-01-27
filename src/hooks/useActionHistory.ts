import { useState, useEffect, useCallback, useMemo } from 'react';
import { StateService } from '../background/state';
import type { Action } from '../types/suggestions';

export const useActionHistory = () => {
    const [windowId, setWindowId] = useState<number | undefined>(undefined);
    const [historyForWindow, setHistoryForWindow] = useState<Action[]>([]);
    const [isUndoing, setIsUndoing] = useState(false);

    useEffect(() => {
        chrome.windows.getCurrent().then(win => win.id !== undefined && setWindowId(win.id));
    }, []);

    useEffect(() => {
        if (windowId === undefined) return;
        const unsubscribe = StateService.subscribeActionHistory(history => {
            setHistoryForWindow(history.filter((a: Action) => a.windowId === windowId));
        });
        return unsubscribe;
    }, [windowId]);

    const undoLast = useCallback(async () => {
        if (windowId === undefined || historyForWindow.length === 0) return;
        setIsUndoing(true);
        try {
            await StateService.undoLast(windowId);
        } finally {
            setIsUndoing(false);
        }
    }, [windowId, historyForWindow.length]);

    const lastAction = historyForWindow.length > 0 ? historyForWindow[historyForWindow.length - 1]! : null;
    const hasUndoableHistory = historyForWindow.length > 0;

    const lastActionLabel = useMemo(() => {
        if (!lastAction) return null;
        if (lastAction.type === 'group') {
            return `Undo: Group "${lastAction.groupName}"`;
        }
        const n = lastAction.urls.length;
        return `Undo: Closed ${n} tab${n !== 1 ? 's' : ''}`;
    }, [lastAction]);

    return { historyForWindow, lastAction, lastActionLabel, hasUndoableHistory, undoLast, isUndoing };
};
