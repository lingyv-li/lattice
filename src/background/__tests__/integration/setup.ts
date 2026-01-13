import { vi } from 'vitest';
import { ProcessingState } from '../../processing';
import { QueueProcessor } from '../../queueProcessor';
import { TabManager } from '../../tabManager';
import { StateService } from '../../state';
import { AIService } from '../../../services/ai/AIService';
import { SettingsStorage, AIProviderType } from '../../../utils/storage';
import { FeatureId } from '../../../types/features';

// Mock modules at top level
vi.mock('../../../utils/storage', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../utils/storage')>();
    return {
        ...actual,
        SettingsStorage: {
            ...actual.SettingsStorage,
            get: vi.fn(),
            subscribe: vi.fn()
        }
    };
});

// Types for our Fake Chrome
export interface FakeTab extends chrome.tabs.Tab {
    id: number;
    windowId: number;
    groupId: number;
}

export interface FakeWindow extends chrome.windows.Window {
    id: number;
    type: chrome.windows.WindowType;
}

export interface FakeGroup extends chrome.tabGroups.TabGroup {
    id: number;
    windowId: number;
    title?: string;
}

export class FakeChrome {
    public tabs: FakeTab[] = [];
    public windows: FakeWindow[] = [];
    public groups: FakeGroup[] = [];

    private nextTabId = 100;
    private nextGroupId = 1000;

    constructor() {
        this.reset();
    }

    reset() {
        this.tabs = [];
        this.windows = [];
        this.groups = [];
        this.nextTabId = 100;
        this.nextGroupId = 1000;

        // Setup global chrome mocks
        this.setupGlobals();
    }

    // --- Helpers to manipulate state ---

    createWindow(id: number, type: chrome.windows.WindowType = chrome.windows.WindowType.NORMAL): FakeWindow {
        const win = { id, type, focused: true, alwaysOnTop: false, incognito: false, state: 'normal' } as FakeWindow;
        this.windows.push(win);
        return win;
    }

    createTab(windowId: number, url: string, active = false): FakeTab {
        const tab: FakeTab = {
            id: this.nextTabId++,
            windowId,
            url,
            title: 'Mock Page ' + url,
            active,
            highlighted: active,
            index: this.tabs.filter(t => t.windowId === windowId).length,
            pinned: false,
            incognito: false,
            selected: active,
            discarded: false,
            autoDiscardable: true,
            groupId: -1,
            status: 'complete',
            frozen: false
        };
        this.tabs.push(tab);
        return tab;
    }

    removeTab(tabId: number) {
        const idx = this.tabs.findIndex(t => t.id === tabId);
        if (idx !== -1) {
            this.tabs.splice(idx, 1);
            // Trigger listeners (if we had them wired fully, but for now we manually trigger TabManager)
        }
    }

    // --- Listener Mocks ---
    private createListenerMock() {
        const listeners = new Set<(...args: unknown[]) => void>();
        return {
            addListener: vi.fn((callback) => {
                console.log("[FakeChrome] addListener called", callback.toString().slice(0, 50));
                listeners.add(callback)
            }),
            removeListener: vi.fn((callback) => listeners.delete(callback)),
            hasListener: vi.fn((callback) => listeners.has(callback)),
            // Helper to trigger events
            dispatch: async (...args: any[]) => {
                for (const listener of listeners) {
                    await listener(...args);
                }
            }
        };
    }

    // --- Mocks implementation ---

    private setupGlobals() {
        // Mock Events
        const tabGroupsOnUpdated = this.createListenerMock();
        const tabGroupsOnCreated = this.createListenerMock();
        const tabGroupsOnRemoved = this.createListenerMock();

        const tabsOnCreated = this.createListenerMock();
        const tabsOnUpdated = this.createListenerMock();
        const tabsOnRemoved = this.createListenerMock();

        const windowsOnRemoved = this.createListenerMock();

        // Expose them so TestContext can use them
        // We attach them to the instance so we can access them in TestContext
        (this as any)._events = {
            tabsOnCreated,
            tabsOnUpdated,
            tabsOnRemoved,
            tabGroupsOnCreated,
            tabGroupsOnUpdated,
            tabGroupsOnRemoved,
            windowsOnRemoved
        };


        global.chrome = {
            tabs: {
                query: vi.fn().mockImplementation(async (queryInfo: chrome.tabs.QueryInfo) => {
                    const res = this.tabs.filter(t => {
                        if (queryInfo.windowId !== undefined && t.windowId !== queryInfo.windowId) return false;
                        return true;
                    });
                    console.log(`[FakeChrome] tabs.query returning ${res.length} tabs`);
                    return res;
                }),
                get: vi.fn().mockImplementation(async (id: number) => {
                    const t = this.tabs.find(x => x.id === id);
                    if (!t) throw new Error('Tab not found');
                    return t;
                }),
                create: vi.fn().mockImplementation(async (props: chrome.tabs.CreateProperties) => {
                    return this.createTab(props.windowId || 1, props.url || 'about:blank');
                }),
                group: vi.fn().mockImplementation(async (options: { tabIds: number | number[], groupId?: number, createProperties?: { windowId?: number } }) => {
                    const ids = Array.isArray(options.tabIds) ? options.tabIds : [options.tabIds];
                    let groupId = options.groupId;

                    if (groupId === undefined) {
                        // Create new group
                        groupId = this.nextGroupId++;
                        const winId = options.createProperties?.windowId ||
                            (ids.length > 0 ? this.tabs.find(t => t.id === ids[0])?.windowId : undefined) || 1;
                        this.groups.push({
                            id: groupId,
                            windowId: winId,
                            collapsed: false,
                            color: 'grey',
                            title: ''
                        } as FakeGroup);
                        // Trigger creation event
                        // (In a real fake, we would call listeners here. For now, TabManager hooks are enough or we rely on manual triggers in TestContext)
                    }

                    // Update tabs
                    for (const id of ids) {
                        const tab = this.tabs.find(t => t.id === id);
                        if (tab) tab.groupId = groupId;
                    }
                    return groupId;
                }),
                onCreated: tabsOnCreated,
                onUpdated: tabsOnUpdated,
                onRemoved: tabsOnRemoved,
                TAB_ID_NONE: -1
            },
            windows: {
                getAll: vi.fn().mockImplementation(async (queryInfo: chrome.windows.QueryOptions | undefined) => {
                    const res = this.windows.filter(w => {
                        if (queryInfo?.windowTypes && !queryInfo.windowTypes.includes(w.type)) return false;
                        return true;
                    });

                    if (queryInfo?.populate) {
                        for (const win of res) {
                            win.tabs = this.tabs.filter(t => t.windowId === win.id);
                        }
                    }
                    console.log(`[FakeChrome] windows.getAll returning ${res.length} windows`);
                    return res;
                }),
                get: vi.fn().mockImplementation(async (id: number, queryInfo?: chrome.windows.QueryOptions) => {
                    const w = this.windows.find(x => x.id === id);
                    if (!w) throw new Error('Window not found');

                    if (queryInfo?.populate) {
                        (w as FakeWindow & { tabs?: FakeTab[] }).tabs = this.tabs.filter(t => t.windowId === id);
                    }
                    return w;
                }),
                onRemoved: windowsOnRemoved,
                WindowType: { NORMAL: 'normal', POPUP: 'popup', PANEL: 'panel', APP: 'app', DEVTOOLS: 'devtools' }
            },
            tabGroups: {
                query: vi.fn().mockImplementation(async (queryInfo: chrome.tabGroups.QueryInfo) => {
                    return this.groups.filter(g => {
                        if (queryInfo.windowId !== undefined && g.windowId !== queryInfo.windowId) return false;
                        return true;
                    });
                }),
                update: vi.fn().mockImplementation(async (groupId: number, updateProperties: chrome.tabGroups.UpdateProperties) => {
                    const group = this.groups.find(g => g.id === groupId);
                    if (group) {
                        if (updateProperties.title !== undefined) group.title = updateProperties.title;
                        if (updateProperties.color !== undefined) group.color = updateProperties.color;
                    }
                    return group;
                }),
                onUpdated: tabGroupsOnUpdated,
                onCreated: tabGroupsOnCreated,
                onRemoved: tabGroupsOnRemoved
            },
            runtime: {
                getURL: vi.fn().mockReturnValue('mock-url'),
                onConnect: { addListener: vi.fn() },
                onInstalled: { addListener: vi.fn() },
                lastError: undefined
            },
            role: {
                create: vi.fn()
            },
            storage: {
                local: {
                    get: vi.fn().mockResolvedValue({}),
                    set: vi.fn().mockResolvedValue(undefined)
                },
                session: {
                    get: vi.fn().mockImplementation(async (_key?: string) => {
                        return (this as any)._sessionStorage || {};
                    }),
                    set: vi.fn().mockImplementation(async (items: any) => {
                        (this as any)._sessionStorage = { ...((this as any)._sessionStorage || {}), ...items };
                    }),
                    remove: vi.fn().mockImplementation(async (keys: string | string[]) => {
                        const k = Array.isArray(keys) ? keys : [keys];
                        const storage = (this as any)._sessionStorage || {};
                        for (const key of k) delete storage[key];
                    })
                }
            },
            alarms: {
                create: vi.fn(),
                get: vi.fn(),
                onAlarm: { addListener: vi.fn() }
            },
            sidePanel: {
                setPanelBehavior: vi.fn().mockResolvedValue(undefined)
            },
            action: {
                setBadgeText: vi.fn(),
                setBadgeBackgroundColor: vi.fn()
            }
        } as unknown as typeof chrome;
    }
}

export class TestContext {
    public chrome: FakeChrome;
    public processingState: ProcessingState;
    public queueProcessor: QueueProcessor;
    public tabManager: TabManager;

    constructor() {
        this.chrome = new FakeChrome();

        // 1. Setup State and Mocks
        this.processingState = new ProcessingState();
        this.queueProcessor = new QueueProcessor(this.processingState);
        this.tabManager = new TabManager(this.processingState, this.queueProcessor);

        // Mock Storage to return Enabled + Autopilot features
        // Note: We use the mocked implementation defined at the top of the file via vi.mock
        // But we can override it here if needed using mockResolvedValue on the mocked method.
        // Since we import the mocked version, we can just cast it.
        vi.mocked(SettingsStorage.get).mockResolvedValue({
            features: {
                [FeatureId.TabGrouper]: { enabled: true, autopilot: true },
                [FeatureId.DuplicateCleaner]: { enabled: true, autopilot: false }
            },
            aiProvider: AIProviderType.Local,
            customGroupingRules: '',
            geminiApiKey: '',
            hasCompletedOnboarding: true,
            aiModel: ''
        });

        vi.spyOn(StateService, 'clearProcessingStatus').mockResolvedValue();
        vi.spyOn(StateService, 'setProcessingWindows').mockResolvedValue();
        vi.spyOn(StateService, 'updateWindowSnapshot').mockResolvedValue();

        // Mock AIService to return deterministic results
        vi.spyOn(AIService, 'getProvider').mockResolvedValue({
            generateSuggestions: async (request: any) => {
                console.error("[MockAI] generateSuggestions called with", request.ungroupedTabs.length, "tabs");
                // Determine groups based on URL keywords
                const suggestions = [];
                const workTabs = request.ungroupedTabs.filter((t: any) => t.url.includes('work'));
                const socialTabs = request.ungroupedTabs.filter((t: any) => t.url.includes('social'));

                if (workTabs.length > 0) {
                    console.error("[MockAI] Found work tabs, suggesting group");
                    suggestions.push({
                        groupName: 'Work',
                        tabIds: workTabs.map((t: any) => t.id),
                        confidence: 0.9
                    });
                }
                if (socialTabs.length > 0) {
                    suggestions.push({
                        groupName: 'Social',
                        tabIds: socialTabs.map((t: any) => t.id),
                        confidence: 0.8
                    });
                }
                return { suggestions };
            }
        } as any);
    }

    async setupWindow(windowId: number) {
        this.chrome.createWindow(windowId);
    }

    /**
     * Adds a tab and triggers the TabManager's "Created" event handler
     */
    async addTab(windowId: number, url: string) {
        const tab = this.chrome.createTab(windowId, url);
        // Simulate event via the mock we wired up in FakeChrome
        const events = (this.chrome as any)._events;
        await events.tabsOnCreated.dispatch(tab);
        return tab;
    }

    /**
     * Removes a tab and triggers the TabManager's "Removed" event handler
     */
    async removeTab(tabId: number, windowId: number) {
        this.chrome.removeTab(tabId);
        const events = (this.chrome as any)._events;
        await events.tabsOnRemoved.dispatch(tabId, { windowId, isWindowClosing: false });
    }

    /**
     * Helper to wait for processing to finish
     */
    async waitForProcessing() {
        // Run queue processor manually if it's not strictly event loop driven in tests
        // But our QueueProcessor IS async loop driven.
        // We can poll isProcessing.

        // Ensure the loop has a chance to start
        await new Promise(r => setTimeout(r, 10));

        let attempts = 0;
        console.log(`[TestContext] Waiting for processing... State items: ${this.processingState.hasItems}, Processing: ${this.processingState.isProcessing}`);
        while ((this.processingState.isProcessing || this.processingState.hasItems) && attempts < 50) {
            await new Promise(r => setTimeout(r, 100)); // wait 100ms
            attempts++;
            if (attempts % 10 === 0) console.log(`[TestContext] Still waiting... items: ${this.processingState.hasItems}`);
        }
        console.log(`[TestContext] Finished waiting. State items: ${this.processingState.hasItems}`);
    }
}
