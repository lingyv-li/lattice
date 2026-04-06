import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { chromeMockScript } from './chrome-mock';

// Chrome extension popup width; height is set to content to avoid empty space
const POPUP_WIDTH = 400;

/**
 * Resize viewport to the intrinsic content height so the screenshot fits with no extra space.
 * Uses the main panel's header + scrollable middle + footer heights (dashboard) or
 * document scrollHeight (onboarding), because flex-1 otherwise makes the layout fill the viewport.
 */
async function setViewportToContent(page: Page) {
    const height = await page.evaluate(() => {
        const root = document.querySelector('#root')?.firstElementChild;
        if (!root) return Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);

        const panel = root.lastElementChild ?? root;
        const header = panel.firstElementChild as HTMLElement | null;
        const footer = panel.lastElementChild as HTMLElement | null;
        const middle = header && footer && panel.children.length >= 3 ? (panel.children[1] as HTMLElement) : null;

        // Onboarding: centered block with h-screen — use bottom of last element (button)
        if ((panel as HTMLElement).classList?.contains('h-screen') && panel.lastElementChild) {
            const bottom = (panel.lastElementChild as HTMLElement).getBoundingClientRect().bottom;
            if (bottom > 0) return Math.ceil(bottom);
        }

        // Dashboard: header + middle scroll height + footer
        if (middle?.scrollHeight) {
            const h = header!.offsetHeight + middle.scrollHeight + footer!.offsetHeight;
            if (h > 0) return Math.ceil(h);
        }
        return Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    });
    await page.setViewportSize({ width: POPUP_WIDTH, height });
}

/** Override sync storage so the popup shows the main dashboard (onboarding complete). */
const completedOnboardingScript = () => {
    (window as unknown as { chrome: { storage: { sync: { get: (keys: unknown, cb: (v: object) => void) => void } } } }).chrome.storage.sync.get = (
        _keys: unknown,
        callback: (items: object) => void
    ) => {
        callback({ hasCompletedOnboarding: true });
        return Promise.resolve({ hasCompletedOnboarding: true });
    };
};

/** Inject session cache + tabs so the popup shows group suggestions (Work, Social). Data inlined so it runs in browser. */
const suggestionsMockScript = () => {
    const WIN = 1;
    const suggestionCache = [
        { tabId: 101, windowId: WIN, groupName: 'Work', existingGroupId: null, timestamp: 1 },
        { tabId: 102, windowId: WIN, groupName: 'Work', existingGroupId: null, timestamp: 1 },
        { tabId: 103, windowId: WIN, groupName: 'Social', existingGroupId: null, timestamp: 1 }
    ];
    const tabs = [
        { id: 101, windowId: WIN, title: 'GitHub', url: 'https://github.com', favIconUrl: '', groupId: -1, status: 'complete' },
        { id: 102, windowId: WIN, title: 'Linear', url: 'https://linear.app', favIconUrl: '', groupId: -1, status: 'complete' },
        { id: 103, windowId: WIN, title: 'Twitter', url: 'https://twitter.com', favIconUrl: '', groupId: -1, status: 'complete' }
    ];
    const w = window as unknown as { chrome: { storage: { session: { get: (keys: unknown, cb?: (items: object) => void) => Promise<object> }; }; tabs: { query: (q: { windowId?: number; currentWindow?: boolean }) => Promise<unknown[]> } } };
    const baseSession = () => ({
        suggestionCache,
        windowSnapshots: {},
        processingWindowIds: [],
        duplicateCounts: {},
        actionHistory: []
    });
    w.chrome.storage.session.get = (keys: unknown, cb?: (items: object) => void) => {
        const items = baseSession();
        const out: Record<string, unknown> = {};
        if (keys === null || keys === undefined) {
            Object.assign(out, items);
        } else if (Array.isArray(keys)) {
            keys.forEach((k: string) => (out[k] = (items as Record<string, unknown>)[k]));
        } else {
            out[keys as string] = (items as Record<string, unknown>)[keys as string];
        }
        cb?.(out);
        return Promise.resolve(out);
    };
    w.chrome.tabs.query = (query: { windowId?: number; currentWindow?: boolean }) => {
        const winId = query.windowId ?? (query.currentWindow ? WIN : undefined);
        const list = winId === WIN || winId === -2 ? tabs : [];
        return Promise.resolve(list);
    };
};

test.describe('Popup', () => {
    test.use({ viewport: { width: POPUP_WIDTH, height: 600 } });

    test('onboarding gate — Welcome to Lattice', async ({ page }) => {
        await page.addInitScript(chromeMockScript);
        await page.goto('/src/sidepanel/');
        await page.waitForSelector('text=Welcome to Lattice', { timeout: 10000 });
        await setViewportToContent(page);
        await expect(page).toHaveScreenshot('popup-onboarding-gate.png');
    });

    test.describe('Dashboard', () => {
        test.beforeEach(async ({ page }) => {
            await page.addInitScript(chromeMockScript);
            await page.addInitScript(completedOnboardingScript);
            await page.goto('/src/sidepanel/');
            await page.waitForSelector('text=All Caught Up', { timeout: 15000 });
        });

        test('default — no suggestions, config section visible', async ({ page }) => {
            await expect(page.locator('text=Auto Grouping')).toBeVisible();
            await setViewportToContent(page);
            await expect(page).toHaveScreenshot('popup-dashboard.png');
        });

        test('with suggestions — group cards and Accept All', async ({ page }) => {
            await page.addInitScript(chromeMockScript);
            await page.addInitScript(completedOnboardingScript);
            await page.addInitScript(suggestionsMockScript);
            await page.goto('/src/sidepanel/');
            await page.waitForSelector('text=Group "Work"', { timeout: 15000 });
            await expect(page.getByRole('button', { name: /Accept All/ })).toBeVisible();
            await setViewportToContent(page);
            await expect(page).toHaveScreenshot('popup-with-suggestions.png');
        });
    });
});
