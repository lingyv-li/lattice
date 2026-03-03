import { test, expect } from '@playwright/test';
import { chromeMockScript } from './chrome-mock';

test.describe('Settings page', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(chromeMockScript);
        await page.goto('/src/options/');
        // Wait for settings to load (replaces the "Loading..." state)
        await page.waitForSelector('text=AI Provider', { timeout: 5000 });
    });

    test('default state — no AI provider configured', async ({ page }) => {
        await expect(page).toHaveScreenshot('options-default.png', { fullPage: true });
    });

    test('Gemini provider selected — shows API key field', async ({ page }) => {
        await page.click('button:has-text("Cloud (Gemini)")');
        await page.waitForSelector('text=API Key', { timeout: 3000 });
        await expect(page).toHaveScreenshot('options-gemini-selected.png', { fullPage: true });
    });

    test('None provider selected — shows setup callout', async ({ page }) => {
        // Default state already shows "None"; confirm the setup callout is visible
        await page.click('button:has-text("None")');
        await expect(page.locator('text=Get Started with AI Tab Grouping')).toBeVisible();
        await expect(page).toHaveScreenshot('options-none-selected.png', { fullPage: true });
    });

    test('download model backdrop — overlay with progress', async ({ page }) => {
        await page.addInitScript(() => {
            (window as unknown as { LanguageModel?: unknown }).LanguageModel = {
                availability: () => Promise.resolve('downloadable'),
                create: (opts: { monitor?: (m: { addEventListener: (ev: string, fn: (e: { loaded: number; total: number }) => void) => void }) => void }) => {
                    if (opts?.monitor) {
                        const m = { addEventListener: (_ev: string, fn: (e: { loaded: number; total: number }) => void) => setTimeout(() => fn({ loaded: 45, total: 100 }), 0) };
                        opts.monitor(m);
                    }
                    return new Promise(() => {}); // never resolve so overlay stays visible for screenshot
                }
            };
        });
        await page.goto('/src/options/');
        await page.waitForSelector('text=AI Provider', { timeout: 5000 });
        await page.click('button:has-text("Local (Chrome)")');
        await page.waitForSelector('text=Downloading AI Model', { timeout: 5000 });
        await expect(page.locator('text=This happens only once')).toBeVisible();
        // Viewport screenshot: overlay uses fixed positioning and fills the viewport
        await expect(page).toHaveScreenshot('options-download-backdrop.png');
    });
});
