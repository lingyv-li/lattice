import { describe, it, expect } from 'vitest';
import { BaseProvider } from '../BaseProvider';
import { TabData } from '../types';

// Concrete subclass exposing protected method for testing
class TestBaseProvider extends BaseProvider {
    id = 'test';

    protected promptAI(): Promise<string> {
        return Promise.resolve('[]');
    }

    public testBuildTabTree(tabs: TabData[]): string {
        return this.buildTabTree(tabs);
    }
}

describe('BaseProvider.buildTabTree', () => {
    const provider = new TestBaseProvider();

    it('renders a flat list when no tabs have openerTabId', () => {
        const tabs: TabData[] = [
            { id: 1, title: 'GitHub', url: 'https://github.com' },
            { id: 2, title: 'Hacker News', url: 'https://news.ycombinator.com' }
        ];

        const result = provider.testBuildTabTree(tabs);

        expect(result).toBe(
            '- [ID: 1] [GitHub](https://github.com/)\n' +
            '- [ID: 2] [Hacker News](https://news.ycombinator.com/)'
        );
    });

    it('indents child tabs under their opener', () => {
        const tabs: TabData[] = [
            { id: 10, title: 'GitHub', url: 'https://github.com' },
            { id: 11, title: 'PR #42', url: 'https://github.com/org/repo/pull/42', openerTabId: 10 }
        ];

        const result = provider.testBuildTabTree(tabs);

        expect(result).toBe(
            '- [ID: 10] [GitHub](https://github.com/)\n' +
            '  - [ID: 11] [PR #42](https://github.com/org/repo/pull/42)'
        );
    });

    it('handles multi-level nesting (child of child)', () => {
        const tabs: TabData[] = [
            { id: 10, title: 'GitHub', url: 'https://github.com' },
            { id: 11, title: 'PR #42', url: 'https://github.com/org/repo/pull/42', openerTabId: 10 },
            { id: 12, title: 'Diff view', url: 'https://github.com/org/repo/pull/42/files', openerTabId: 11 }
        ];

        const result = provider.testBuildTabTree(tabs);

        expect(result).toBe(
            '- [ID: 10] [GitHub](https://github.com/)\n' +
            '  - [ID: 11] [PR #42](https://github.com/org/repo/pull/42)\n' +
            '    - [ID: 12] [Diff view](https://github.com/org/repo/pull/42/files)'
        );
    });

    it('treats tabs whose opener is not in the batch as roots', () => {
        const tabs: TabData[] = [
            // openerTabId 99 is NOT in the batch
            { id: 11, title: 'PR #42', url: 'https://github.com/org/repo/pull/42', openerTabId: 99 },
            { id: 12, title: 'Diff view', url: 'https://github.com/org/repo/pull/42/files', openerTabId: 11 }
        ];

        const result = provider.testBuildTabTree(tabs);

        // Tab 11 becomes a root because its opener (99) is absent; tab 12 is a child of 11
        expect(result).toBe(
            '- [ID: 11] [PR #42](https://github.com/org/repo/pull/42)\n' +
            '  - [ID: 12] [Diff view](https://github.com/org/repo/pull/42/files)'
        );
    });

    it('handles mixed tree and flat tabs together', () => {
        const tabs: TabData[] = [
            { id: 10, title: 'GitHub', url: 'https://github.com' },
            { id: 11, title: 'PR #42', url: 'https://github.com/org/repo/pull/42', openerTabId: 10 },
            { id: 20, title: 'Hacker News', url: 'https://news.ycombinator.com' }
        ];

        const result = provider.testBuildTabTree(tabs);

        expect(result).toBe(
            '- [ID: 10] [GitHub](https://github.com/)\n' +
            '  - [ID: 11] [PR #42](https://github.com/org/repo/pull/42)\n' +
            '- [ID: 20] [Hacker News](https://news.ycombinator.com/)'
        );
    });

    it('guards against cycles (tab A opens B, B opens A)', () => {
        const tabs: TabData[] = [
            { id: 1, title: 'Tab A', url: 'https://a.com', openerTabId: 2 },
            { id: 2, title: 'Tab B', url: 'https://b.com', openerTabId: 1 }
        ];

        // Both tabs point to each other as opener. The algorithm must not loop.
        // Since both have an opener that is in the batch, the one that appears first
        // in the children map for a root will be rendered; duplicates are skipped via visited.
        expect(() => provider.testBuildTabTree(tabs)).not.toThrow();

        const result = provider.testBuildTabTree(tabs);
        // The output should contain each tab at most once
        const lines = result.split('\n');
        const ids = lines.map(l => l.match(/\[ID: (\d+)\]/)?.[1]).filter(Boolean);
        expect(new Set(ids).size).toBe(ids.length); // no duplicates
    });

    it('returns empty string for empty tab list', () => {
        expect(provider.testBuildTabTree([])).toBe('');
    });
});
