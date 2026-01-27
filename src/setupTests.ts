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
        group: vi.fn().mockResolvedValue(1)
    },
    tabGroups: {
        update: vi.fn(),
        query: vi.fn().mockResolvedValue([])
    },
    windows: {
        get: vi.fn(),
        getAll: vi.fn(),
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
                const result = typeof _defaults === 'object' ? _defaults : {};
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

global.chrome = chromeMock as unknown as typeof chrome;

// Mock LanguageModel

global.window = global.window || {};

global.window.LanguageModel = {
    create: vi.fn().mockResolvedValue({
        prompt: vi.fn(),
        destroy: vi.fn()
    })
};

global.self = global.window;
