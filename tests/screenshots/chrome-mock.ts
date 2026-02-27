/**
 * Injects a minimal Chrome extension API mock into the page so standalone
 * HTML pages (welcome, options) can be rendered in a normal browser context
 * without throwing on missing chrome.* globals.
 *
 * Usage: await page.addInitScript({ path: 'tests/screenshots/chrome-mock.ts' })
 * — but since Playwright can't execute raw TS, pass the compiled function via
 * page.addInitScript(chromeMockScript) instead.
 */
export const chromeMockScript = () => {
    /* eslint-disable */
    (window as any).chrome = {
        storage: {
            sync: {
                get: (_keys: unknown, callback: (items: object) => void) => {
                    callback({});
                    return Promise.resolve({});
                },
                set: (_items: unknown, callback?: () => void) => {
                    callback?.();
                    return Promise.resolve();
                }
            },
            local: {
                get: (_keys: unknown, callback: (items: object) => void) => {
                    callback({});
                    return Promise.resolve({});
                },
                set: (_items: unknown, callback?: () => void) => {
                    callback?.();
                    return Promise.resolve();
                }
            },
            session: {
                get: (_keys: unknown, callback: (items: object) => void) => {
                    callback({});
                    return Promise.resolve({});
                },
                set: (_items: unknown, callback?: () => void) => {
                    callback?.();
                    return Promise.resolve();
                }
            }
        },
        runtime: {
            connect: () => ({
                postMessage: () => {},
                disconnect: () => {},
                onDisconnect: { addListener: () => {} }
            })
        },
        windows: {
            getCurrent: () => Promise.resolve({ id: 1 })
        }
    };
    // Leave window.LanguageModel undefined so LocalProvider.checkAvailability()
    // returns 'unavailable' — the most common real-world state for screenshot tests.
    /* eslint-enable */
};
