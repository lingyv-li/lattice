import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DuplicateCloser } from '../DuplicateCloser';

// Mock chrome API
const mockTabs = {
    query: vi.fn(),
    remove: vi.fn()
};

global.chrome = {
    tabs: mockTabs
} as unknown as typeof chrome;

describe('DuplicateCloser', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('closeDuplicates', () => {
        it('should close duplicate tabs in current window', async () => {
            mockTabs.query.mockResolvedValue([
                { id: 1, url: 'https://example.com', windowId: 10 },
                { id: 2, url: 'https://example.com', windowId: 10 }, // duplicate
                { id: 3, url: 'https://other.com', windowId: 10 }
            ]);
            mockTabs.remove.mockResolvedValue(undefined);

            const result = await DuplicateCloser.closeDuplicates();

            expect(mockTabs.query).toHaveBeenCalledWith({ currentWindow: true });
            expect(mockTabs.remove).toHaveBeenCalledWith([2]);
            expect(result.closedCount).toBe(1);
            expect(result.tabsRemoved).toEqual([2]);
            expect(result.actions).toHaveLength(1);
            expect(result.actions[0]).toEqual({ type: 'deduplicate', windowId: 10, url: 'https://example.com', urls: ['https://example.com'] });
        });

        it('should return empty result when no duplicates exist', async () => {
            mockTabs.query.mockResolvedValue([
                { id: 1, url: 'https://example.com' },
                { id: 2, url: 'https://other.com' }
            ]);

            const result = await DuplicateCloser.closeDuplicates();

            expect(mockTabs.remove).not.toHaveBeenCalled();
            expect(result.closedCount).toBe(0);
            expect(result.tabsRemoved).toEqual([]);
            expect(result.actions).toEqual([]);
        });

        it('should use windowId when provided', async () => {
            mockTabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);

            await DuplicateCloser.closeDuplicates(123);

            expect(mockTabs.query).toHaveBeenCalledWith({ windowId: 123 });
        });
    });

    describe('closeDuplicatesInWindow', () => {
        it('should close duplicates in specific window', async () => {
            mockTabs.query.mockResolvedValue([
                { id: 10, url: 'https://a.com', windowId: 456 },
                { id: 11, url: 'https://a.com', windowId: 456 }, // duplicate
                { id: 12, url: 'https://a.com', windowId: 456 } // duplicate
            ]);
            mockTabs.remove.mockResolvedValue(undefined);

            const result = await DuplicateCloser.closeDuplicatesInWindow(456);

            expect(mockTabs.query).toHaveBeenCalledWith({ windowId: 456 });
            expect(mockTabs.remove).toHaveBeenCalledWith([11, 12]);
            expect(result.closedCount).toBe(2);
            expect(result.tabsRemoved).toEqual([11, 12]);
            expect(result.actions).toHaveLength(1);
            expect(result.actions[0]).toEqual({ type: 'deduplicate', windowId: 456, url: 'https://a.com', urls: ['https://a.com', 'https://a.com'] });
        });

        it('should keep pinned tabs over unpinned duplicates', async () => {
            mockTabs.query.mockResolvedValue([
                { id: 1, url: 'https://example.com', pinned: false, windowId: 1 },
                { id: 2, url: 'https://example.com', pinned: true, windowId: 1 } // should be kept
            ]);
            mockTabs.remove.mockResolvedValue(undefined);

            const result = await DuplicateCloser.closeDuplicatesInWindow(1);

            // Tab 1 should be removed because tab 2 is pinned
            expect(mockTabs.remove).toHaveBeenCalledWith([1]);
            expect(result.tabsRemoved).toEqual([1]);
            expect(result.actions).toHaveLength(1);
            expect(result.actions[0].urls).toContain('https://example.com');
        });

        it('should keep active tab over inactive duplicates', async () => {
            mockTabs.query.mockResolvedValue([
                { id: 1, url: 'https://example.com', active: false, windowId: 1 },
                { id: 2, url: 'https://example.com', active: true, windowId: 1 } // should be kept
            ]);
            mockTabs.remove.mockResolvedValue(undefined);

            const result = await DuplicateCloser.closeDuplicatesInWindow(1);

            expect(mockTabs.remove).toHaveBeenCalledWith([1]);
            expect(result.tabsRemoved).toEqual([1]);
            expect(result.actions).toHaveLength(1);
        });
    });
});
