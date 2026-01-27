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
                { id: 1, url: 'https://example.com' },
                { id: 2, url: 'https://example.com' }, // duplicate
                { id: 3, url: 'https://other.com' }
            ]);
            mockTabs.remove.mockResolvedValue(undefined);

            const result = await DuplicateCloser.closeDuplicates();

            expect(mockTabs.query).toHaveBeenCalledWith({ currentWindow: true });
            expect(mockTabs.remove).toHaveBeenCalledWith([2]);
            expect(result.closedCount).toBe(1);
            expect(result.tabsRemoved).toEqual([2]);
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
                { id: 10, url: 'https://a.com' },
                { id: 11, url: 'https://a.com' }, // duplicate
                { id: 12, url: 'https://a.com' } // duplicate
            ]);
            mockTabs.remove.mockResolvedValue(undefined);

            const result = await DuplicateCloser.closeDuplicatesInWindow(456);

            expect(mockTabs.query).toHaveBeenCalledWith({ windowId: 456 });
            expect(mockTabs.remove).toHaveBeenCalledWith([11, 12]);
            expect(result.closedCount).toBe(2);
            expect(result.tabsRemoved).toEqual([11, 12]);
        });

        it('should keep pinned tabs over unpinned duplicates', async () => {
            mockTabs.query.mockResolvedValue([
                { id: 1, url: 'https://example.com', pinned: false },
                { id: 2, url: 'https://example.com', pinned: true } // should be kept
            ]);
            mockTabs.remove.mockResolvedValue(undefined);

            const result = await DuplicateCloser.closeDuplicatesInWindow(1);

            // Tab 1 should be removed because tab 2 is pinned
            expect(mockTabs.remove).toHaveBeenCalledWith([1]);
            expect(result.tabsRemoved).toEqual([1]);
        });

        it('should keep active tab over inactive duplicates', async () => {
            mockTabs.query.mockResolvedValue([
                { id: 1, url: 'https://example.com', active: false },
                { id: 2, url: 'https://example.com', active: true } // should be kept
            ]);
            mockTabs.remove.mockResolvedValue(undefined);

            const result = await DuplicateCloser.closeDuplicatesInWindow(1);

            expect(mockTabs.remove).toHaveBeenCalledWith([1]);
            expect(result.tabsRemoved).toEqual([1]);
        });
    });
});
