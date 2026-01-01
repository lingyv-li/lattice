import { WindowSnapshot } from '../../utils/snapshots';

/**
 * Mock class for testing WindowSnapshot dependent logic.
 * Exposes a public constructor to create snapshots with specific test data.
 * Also exposes internal getters for testing purposes ONLY.
 */
export class MockWindowSnapshot extends WindowSnapshot {
    constructor(tabs: chrome.tabs.Tab[], groups: chrome.tabGroups.TabGroup[] = []) {
        super(tabs, groups);
    }
}
