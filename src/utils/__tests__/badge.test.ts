
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateWindowBadge } from '../badge';

describe('badge utils', () => {
    // Mock chrome APIs
    const queryMock = vi.fn();
    const setBadgeTextMock = vi.fn();
    const setBadgeBgMock = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        global.chrome = {
            tabs: { query: queryMock },
            action: {
                setBadgeText: setBadgeTextMock,
                setBadgeBackgroundColor: setBadgeBgMock
            }
        } as unknown as typeof chrome;
    });

    describe('updateWindowBadge', () => {
        it('should show processing state', async () => {
            // Mock active tab for window
            queryMock.mockResolvedValue([{ id: 99 }]);

            // windowId=123, isProcessing=true, groupCount=0, duplicateCount=0, hasError=false
            await updateWindowBadge(123, true, 0, 0, false);

            expect(queryMock).toHaveBeenCalledWith({ windowId: 123, active: true });
            expect(setBadgeTextMock).toHaveBeenCalledWith({ text: "...", tabId: 99 });
            expect(setBadgeBgMock).toHaveBeenCalledWith({ color: "#A855F7", tabId: 99 });
        });

        it('should show total count', async () => {
            // Mock active tab for window
            queryMock.mockImplementation((query) => {
                if (query.active) return Promise.resolve([{ id: 99 }]); // Active tab
                return Promise.resolve([]);
            });

            // processing=false, groupCount=2, duplicateCount=1 => Total 3
            await updateWindowBadge(123, false, 2, 1, false);

            expect(queryMock).toHaveBeenCalledWith({ windowId: 123, active: true });
            expect(setBadgeTextMock).toHaveBeenCalledWith({ text: "3", tabId: 99 });
            expect(setBadgeBgMock).toHaveBeenCalledWith({ color: "#22C55E", tabId: 99 });
        });

        it('should do nothing if no active tab in window', async () => {
            queryMock.mockResolvedValue([]);
            await updateWindowBadge(123, false, 0, 0, false);
            expect(setBadgeTextMock).not.toHaveBeenCalled();
        });

        it('should show error state with correct color', async () => {
            // Mock active tab for window
            queryMock.mockResolvedValue([{ id: 99 }]);

            await updateWindowBadge(123, false, 0, 0, true);

            expect(queryMock).toHaveBeenCalledWith({ windowId: 123, active: true });
            expect(setBadgeTextMock).toHaveBeenCalledWith({ text: "ERR", tabId: 99 });
            expect(setBadgeBgMock).toHaveBeenCalledWith({ color: "#D93025", tabId: 99 });
        });

        it('should show custom text', async () => {
            queryMock.mockResolvedValue([{ id: 99 }]);

            await updateWindowBadge(123, false, 0, 0, false, "!", "#FFA500");

            expect(setBadgeTextMock).toHaveBeenCalledWith({ text: "!", tabId: 99 });
            expect(setBadgeBgMock).toHaveBeenCalledWith({ color: "#FFA500", tabId: 99 });
        });
    });
});
