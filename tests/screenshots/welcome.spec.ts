import { test, expect } from '@playwright/test';
import { chromeMockScript } from './chrome-mock';

test.describe('Onboarding page', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(chromeMockScript);
        await page.goto('/src/welcome/');
        // Wait for step 1 content to be visible (async LocalProvider check completes)
        await page.waitForSelector('text=AI-Powered Tab Management', { timeout: 5000 });
    });

    test('step 1 — welcome', async ({ page }) => {
        await expect(page).toHaveScreenshot('welcome-step1.png', { fullPage: true });
    });

    test('step 2 — AI provider setup', async ({ page }) => {
        await page.click('button:has-text("Next")');
        await page.waitForSelector('text=Choose Your AI Provider', { timeout: 5000 });
        await expect(page).toHaveScreenshot('welcome-step2-provider-setup.png', { fullPage: true });
    });

    test('step 2 — Gemini provider selected', async ({ page }) => {
        await page.click('button:has-text("Next")');
        await page.waitForSelector('text=Choose Your AI Provider', { timeout: 5000 });
        await page.click('button:has-text("Google Gemini")');
        await page.waitForSelector('text=Gemini API Key', { timeout: 3000 });
        await expect(page).toHaveScreenshot('welcome-step2-gemini-selected.png', { fullPage: true });
    });

    test('step 3 — complete', async ({ page }) => {
        // Advance through step 1 → step 2 → step 3 (no AI configured, no download needed)
        await page.click('button:has-text("Next")');
        await page.waitForSelector('text=Choose Your AI Provider', { timeout: 5000 });
        await page.click('button:has-text("Next")');
        await page.waitForSelector("text=You're All Set!", { timeout: 5000 });
        await expect(page).toHaveScreenshot('welcome-step3-complete.png', { fullPage: true });
    });
});
