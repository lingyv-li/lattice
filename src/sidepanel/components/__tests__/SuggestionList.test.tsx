import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SuggestionList } from '../SuggestionList';
import { useTabGrouper } from '../../../hooks/useTabGrouper';
import { useDuplicateCleaner } from '../../../hooks/useDuplicateCleaner';

// Mock hooks
vi.mock('../../../hooks/useTabGrouper');
vi.mock('../../../hooks/useDuplicateCleaner');

describe('SuggestionList', () => {
    const mockApplyGroup = vi.fn();
    const mockCloseDuplicateGroup = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();

        vi.mocked(useTabGrouper).mockReturnValue({
            suggestionActions: [],
            snapshot: { getTabData: vi.fn() } as any,
            applyGroup: mockApplyGroup,
            isBackgroundProcessing: false
        } as any);

        vi.mocked(useDuplicateCleaner).mockReturnValue({
            duplicateGroups: new Map(),
            suggestionActions: [],
            closeDuplicateGroup: mockCloseDuplicateGroup
        } as any);
    });

    it('renders empty state when no suggestions', () => {
        const { asFragment } = render(<SuggestionList />);
        expect(asFragment()).toMatchSnapshot();
        expect(screen.getByText('All Caught Up')).toBeInTheDocument();
    });

    it('renders loading state when processing in background', () => {
        vi.mocked(useTabGrouper).mockReturnValue({
            suggestionActions: [],
            snapshot: { getTabData: vi.fn() } as any,
            applyGroup: mockApplyGroup,
            isBackgroundProcessing: true
        } as any);

        const { asFragment } = render(<SuggestionList />);
        expect(asFragment()).toMatchSnapshot();
        expect(screen.getByText('Scanning Tabs...')).toBeInTheDocument();
    });

    it('renders grouping suggestions', () => {
        const mockSnapshot = {
            getTabData: vi.fn((id: number) => ({
                id,
                title: `Tab ${id}`,
                url: 'http://e.com',
                favIconUrl: ''
            }))
        };

        vi.mocked(useTabGrouper).mockReturnValue({
            suggestionActions: [
                { type: 'group', windowId: 1, tabIds: [1, 2], groupName: 'Work', existingGroupId: null }
            ],
            snapshot: mockSnapshot as any,
            applyGroup: mockApplyGroup,
            isBackgroundProcessing: false
        } as any);

        const { asFragment } = render(<SuggestionList />);
        expect(asFragment()).toMatchSnapshot();
        expect(screen.getByText('Group "Work"')).toBeInTheDocument();
    });

    it('renders duplicate suggestions', () => {
        const duplicates = new Map();
        duplicates.set('http://dup.com', [
            { id: 1, title: 'Original', url: 'http://dup.com' },
            { id: 2, title: 'Copy', url: 'http://dup.com' }
        ]);

        vi.mocked(useDuplicateCleaner).mockReturnValue({
            duplicateGroups: duplicates,
            suggestionActions: [{ type: 'deduplicate', windowId: 1, url: 'http://dup.com', urls: ['http://dup.com'] }],
            closeDuplicateGroup: mockCloseDuplicateGroup
        } as any);

        const { asFragment } = render(<SuggestionList />);
        expect(asFragment()).toMatchSnapshot();
        expect(screen.getByText('Clean "Original"')).toBeInTheDocument();
    });
});
