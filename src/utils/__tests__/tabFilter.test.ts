import { describe, it, expect } from 'vitest';
import { isGroupableTab, isEmptyNewTab } from '../tabFilter';

describe('tabFilter', () => {
    describe('isEmptyNewTab', () => {
        it('should identify empty new tab pages', () => {
            expect(isEmptyNewTab('chrome://newtab/')).toBe(true);
            expect(isEmptyNewTab('chrome://new-tab-page/')).toBe(true);
            expect(isEmptyNewTab('about:blank')).toBe(true);
            expect(isEmptyNewTab('edge://newtab/')).toBe(true);
            expect(isEmptyNewTab('https://google.com')).toBe(false);
        });
    });

    describe('isGroupableTab', () => {
        const baseTab: Partial<chrome.tabs.Tab> = {
            id: 1,
            windowId: 10,
            url: 'https://example.com',
            title: 'Example',
            status: 'complete'
        };

        it('should return true for normal tabs', () => {
            expect(isGroupableTab(baseTab as chrome.tabs.Tab)).toBe(true);
        });

        it('should return false for tabs without ID', () => {
            const tab = { ...baseTab, id: undefined };
            expect(isGroupableTab(tab as chrome.tabs.Tab)).toBe(false);
        });

        it('should return false for tabs without URL', () => {
            const tab = { ...baseTab, url: undefined };
            expect(isGroupableTab(tab as chrome.tabs.Tab)).toBe(false);
        });

        it('should return false for tabs without title', () => {
            const tab = { ...baseTab, title: undefined };
            expect(isGroupableTab(tab as chrome.tabs.Tab)).toBe(false);
        });

        it('should return false for loading tabs', () => {
            const tab = { ...baseTab, status: 'loading' };
            expect(isGroupableTab(tab as chrome.tabs.Tab)).toBe(false);
        });

        it('should return false for empty new tab pages', () => {
            const tab = { ...baseTab, url: 'chrome://newtab/' };
            expect(isGroupableTab(tab as chrome.tabs.Tab)).toBe(false);
        });
    });
});
