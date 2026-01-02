
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateDuplicateCount, updateWindowBadge } from '../badge';

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

    describe('calculateDuplicateCount', () => {
        it('should return 0 when no tabs', async () => {
            queryMock.mockResolvedValue([]);
            const count = await calculateDuplicateCount();
            expect(count).toBe(0);
        });

        it('should count single duplicate pair in specific window', async () => {
            // Expect windowId query
            queryMock.mockResolvedValue([
                { url: 'https://a.com' },
                { url: 'https://a.com' }
            ]);
            const count = await calculateDuplicateCount(123);

            // Should have been called with windowId
            expect(queryMock).toHaveBeenCalledWith({ windowId: 123 });
            expect(count).toBe(1);
        });
    });

    describe('updateWindowBadge', () => {
        it('should show processing state', async () => {
            // Mock active tab for window
            queryMock.mockResolvedValue([{ id: 99 }]);

            await updateWindowBadge(123, true, 0, false);

            expect(queryMock).toHaveBeenCalledWith({ windowId: 123, active: true });
            expect(setBadgeTextMock).toHaveBeenCalledWith({ text: "...", tabId: 99 });
            expect(setBadgeBgMock).toHaveBeenCalledWith({ color: "#A855F7", tabId: 99 });
        });

        it('should show total count', async () => {
            // Mock active tab for window
            queryMock.mockImplementation((query) => {
                if (query.active) return Promise.resolve([{ id: 99 }]); // Active tab
                // Duplicate check query (all tabs in window)
                return Promise.resolve([
                    { url: 'https://a.com' },
                    { url: 'https://a.com' } // 1 duplicate
                ]);
            });

            // processing=false, groupCount=2, duplicateCount=1 => Total 3
            await updateWindowBadge(123, false, 2, false);

            expect(queryMock).toHaveBeenCalledWith({ windowId: 123, active: true });
            expect(setBadgeTextMock).toHaveBeenCalledWith({ text: "3", tabId: 99 });
            expect(setBadgeBgMock).toHaveBeenCalledWith({ color: "#22C55E", tabId: 99 });
        });

        it('should do nothing if no active tab in window', async () => {
            queryMock.mockResolvedValue([]);
            await updateWindowBadge(123, false, 0, false);
            expect(setBadgeTextMock).not.toHaveBeenCalled();
        });

        it('should show error state with correct color', async () => {
            // Mock active tab for window
            queryMock.mockResolvedValue([{ id: 99 }]);

            await updateWindowBadge(123, false, 0, true);

            expect(queryMock).toHaveBeenCalledWith({ windowId: 123, active: true });
            expect(setBadgeTextMock).toHaveBeenCalledWith({ text: "ERR", tabId: 99 });
            expect(setBadgeBgMock).toHaveBeenCalledWith({ color: "#D93025", tabId: 99 });
        });
    });
});
