import { vi, afterEach, expect } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';

expect.extend(matchers);

// Run cleanup after each test
afterEach(() => {
    cleanup();
});

// Mock Chrome API globally
const chromeMock = {
    tabs: {
        TAB_ID_NONE: -1,
        query: vi.fn(),
        onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
        onCreated: { addListener: vi.fn(), removeListener: vi.fn() },
        onRemoved: { addListener: vi.fn(), removeListener: vi.fn() },
        group: vi.fn().mockResolvedValue(1),
    },
    tabGroups: {
        update: vi.fn(),
        query: vi.fn().mockResolvedValue([]),
    },
    windows: {
        getCurrent: vi.fn().mockResolvedValue({ id: 1 })
    },
    runtime: {
        connect: vi.fn().mockReturnValue({
            onMessage: { addListener: vi.fn() },
            onDisconnect: { addListener: vi.fn() },
            postMessage: vi.fn(),
            disconnect: vi.fn()
        })
    },
    storage: {
        session: {
            get: vi.fn().mockImplementation((_keys, callback) => {
                const result = {}; // Return empty or mock data
                if (callback) callback(result);
                return Promise.resolve(result);
            }),
            set: vi.fn().mockImplementation((_data, callback) => {
                if (callback) callback();
                return Promise.resolve();
            })
        },
        local: {
            get: vi.fn().mockImplementation((_keys, callback) => {
                const result = {};
                if (callback) callback(result);
                return Promise.resolve(result);
            }),
            set: vi.fn().mockImplementation((_data, callback) => {
                if (callback) callback();
                return Promise.resolve();
            })
        },
        sync: {
            get: vi.fn().mockImplementation((_defaults, callback) => {
                // If defaults passed, return them as result for simplicity in tests
                const result = (typeof _defaults === 'object') ? _defaults : {};
                if (callback) callback(result);
                return Promise.resolve(result);
            }),
            set: vi.fn().mockImplementation((_data, callback) => {
                if (callback) callback();
                return Promise.resolve();
            })
        },
        onChanged: {
            addListener: vi.fn(),
            removeListener: vi.fn()
        }
    },
    sidePanel: {
        setOptions: vi.fn(),
        open: vi.fn()
    },
    alarms: {
        create: vi.fn(),
        onAlarm: { addListener: vi.fn() }
    },
    action: {
        onClicked: { addListener: vi.fn() }
    }
};

// @ts-ignore
global.chrome = chromeMock;

// Mock LanguageModel
// @ts-ignore
global.window = global.window || {};
// @ts-ignore
global.window.LanguageModel = {
    availability: vi.fn().mockResolvedValue('available'),
    create: vi.fn().mockResolvedValue({
        prompt: vi.fn(),
        destroy: vi.fn()
    })
};
// @ts-ignore
global.self = global.window;
