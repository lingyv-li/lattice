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
});
