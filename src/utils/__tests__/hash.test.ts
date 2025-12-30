import { describe, it, expect } from 'vitest';
import { computeTabHash, computeGroupsHash, computeInputHash } from '../hash';

describe('hash utilities', () => {
    describe('computeTabHash', () => {
        it('should produce different hashes for different URLs', () => {
            const hash1 = computeTabHash({ url: 'https://a.com', title: 'Test' });
            const hash2 = computeTabHash({ url: 'https://b.com', title: 'Test' });
            expect(hash1).not.toBe(hash2);
        });

        it('should produce different hashes for different titles', () => {
            const hash1 = computeTabHash({ url: 'https://a.com', title: 'One' });
            const hash2 = computeTabHash({ url: 'https://a.com', title: 'Two' });
            expect(hash1).not.toBe(hash2);
        });
    });

    describe('computeGroupsHash', () => {
        it('should produce consistent hash regardless of order', () => {
            const groups1 = [{ id: 1, title: 'A' }, { id: 2, title: 'B' }];
            const groups2 = [{ id: 2, title: 'B' }, { id: 1, title: 'A' }];
            expect(computeGroupsHash(groups1)).toBe(computeGroupsHash(groups2));
        });

        it('should produce different hash when groups change', () => {
            const before = [{ id: 1, title: 'Work' }];
            const after = [{ id: 1, title: 'Work' }, { id: 2, title: 'Personal' }];
            expect(computeGroupsHash(before)).not.toBe(computeGroupsHash(after));
        });

        it('should handle empty groups', () => {
            expect(computeGroupsHash([])).toBe('');
        });
    });

    describe('computeInputHash', () => {
        it('should detect groups changes', () => {
            const tab = { url: 'https://example.com', title: 'Example' };
            const hash1 = computeInputHash(tab, [{ id: 1, title: 'Work' }]);
            const hash2 = computeInputHash(tab, [{ id: 1, title: 'Work' }, { id: 2, title: 'Personal' }]);
            expect(hash1).not.toBe(hash2);
        });
    });
});
