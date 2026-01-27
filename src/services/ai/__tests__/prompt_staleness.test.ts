import { describe, it, expect } from 'vitest';
import { GeminiProvider } from '../GeminiProvider';
import { GroupContext } from '../types';

// Helper subclass to expose protected method
class TestGeminiProvider extends GeminiProvider {
    constructor() {
        super('dummy-key', 'gemini-pro');
    }

    public testConstructExistingGroupsPrompt(groups: Map<string, GroupContext>): string {
        return this.constructExistingGroupsPrompt(groups);
    }

    // Abstract methods implementation for instantiation
    protected async promptAI(): Promise<string> {
        return '';
    }
}

describe('Prompts with Staleness Logic', () => {
    it('should sort existing groups by recency (newest first)', () => {
        const provider = new TestGeminiProvider();
        const now = Date.now();
        const groups = new Map<string, GroupContext>();

        groups.set('Old Group', { id: 1, tabs: [], lastActive: now - 10000000 });
        groups.set('New Group', { id: 2, tabs: [], lastActive: now - 1000 });
        groups.set('Mid Group', { id: 3, tabs: [], lastActive: now - 50000 });

        const prompt = provider.testConstructExistingGroupsPrompt(groups);

        // Expect order: New -> Mid -> Old
        const newIndex = prompt.indexOf('New Group');
        const midIndex = prompt.indexOf('Mid Group');
        const oldIndex = prompt.indexOf('Old Group');

        expect(newIndex).toBeLessThan(midIndex);
        expect(midIndex).toBeLessThan(oldIndex);
    });

    it('should annotate groups with correct staleness labels', () => {
        const provider = new TestGeminiProvider();
        const now = Date.now();
        const groups = new Map<string, GroupContext>();

        const ONE_DAY = 24 * 60 * 60 * 1000;

        groups.set('Active Today', { id: 1, tabs: [], lastActive: now - 1000 });
        groups.set('Active Yesterday', { id: 2, tabs: [], lastActive: now - 2 * ONE_DAY });
        groups.set('Stale Group', { id: 3, tabs: [], lastActive: now - 10 * ONE_DAY });

        const prompt = provider.testConstructExistingGroupsPrompt(groups);

        console.log('Checking prompt:\n', prompt);

        expect(prompt).toContain('- "Active Today" (Active today)');
        expect(prompt).toContain(`- "Active Yesterday" (Active 2d ago)`);
        expect(prompt).toContain(`- "Stale Group" (Inactive 10d)`);
    });

    it('should handle groups without lastActive (treat as oldest/unsorted)', () => {
        const provider = new TestGeminiProvider();
        const now = Date.now();
        const groups = new Map<string, GroupContext>();

        groups.set('Known Time', { id: 1, tabs: [], lastActive: now });
        groups.set('Unknown Time', { id: 2, tabs: [] }); // undefined lastActive

        const prompt = provider.testConstructExistingGroupsPrompt(groups);

        // Known Time (now) should be before Unknown Time (0)
        expect(prompt.indexOf('Known Time')).toBeLessThan(prompt.indexOf('Unknown Time'));

        // Unknown time group should have no label
        // The regex checks for the name followed immediately by newline or just not having a label
        // easier to check it doesn't have "Active" or "Inactive"
        const unknownLine = prompt.split('\n').find(l => l.includes('Unknown Time'));
        expect(unknownLine).toBeDefined();
        expect(unknownLine).not.toContain('(Active');
        expect(unknownLine).not.toContain('(Inactive');
    });
});
