import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests/screenshots',
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: 0,
    workers: 1,
    reporter: process.env.CI ? 'github' : 'html',
    use: {
        baseURL: 'http://localhost:4173',
        colorScheme: 'light'
    },
    expect: {
        toHaveScreenshot: {
            // Allow up to 1% pixel difference to account for anti-aliasing
            maxDiffPixelRatio: 0.01
        }
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } }
        }
    ],
    webServer: {
        command: 'npm run preview',
        // Must be a URL that returns 2xx/3xx/4xx (not 404); root returns 404 so use an entry that exists
        url: 'http://localhost:4173/src/options/',
        reuseExistingServer: !process.env.CI,
        timeout: 60_000
    }
});
