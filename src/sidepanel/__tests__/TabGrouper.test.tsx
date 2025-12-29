import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { TabGrouper } from '../TabGrouper';
import * as useTabGrouperHook from '../../hooks/useTabGrouper';

// Mock the hook
vi.mock('../../hooks/useTabGrouper');

describe('TabGrouper', () => {
    const defaultMock = {
        status: 'idle',
        error: null,
        progress: null,
        previewGroups: null,
        selectedPreviewIndices: new Set(),
        tabDataMap: new Map(),
        availability: 'available',
        ungroupedCount: 5,
        isBackgroundProcessing: false,
        generateGroups: vi.fn(),
        applyGroups: vi.fn(),
        cancelGroups: vi.fn(),
        rejectGroup: vi.fn(),
        toggleGroupSelection: vi.fn(),
        setAllGroupsSelected: vi.fn(),
    };

    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('should render "Analyzing..." when background processing is active', () => {
        vi.spyOn(useTabGrouperHook, 'useTabGrouper').mockReturnValue({
            ...defaultMock,
            isBackgroundProcessing: true
        } as any);

        render(<TabGrouper />);
        expect(screen.getByText(/Analyzing tabs in background/i)).toBeInTheDocument();
    });

    it('should NOT render the large "Organize/Group" button when idle with ungrouped tabs', () => {
        // Because generation is automatic, we shouldn't see the manual trigger
        vi.spyOn(useTabGrouperHook, 'useTabGrouper').mockReturnValue({
            ...defaultMock,
            ungroupedCount: 5,
            previewGroups: null,
            status: 'idle'
        } as any);

        render(<TabGrouper />);
        // The big button text would be "Group 5 Tabs" if it existed
        expect(screen.queryByText(/Group 5 Tabs/i)).not.toBeInTheDocument();
        // Should verify no button with "Group" text exists generally
        expect(screen.queryByRole('button', { name: /Group/i })).not.toBeInTheDocument();
    });

    it('should render "Regenerate" button and trigger generation', () => {
        vi.spyOn(useTabGrouperHook, 'useTabGrouper').mockReturnValue({
            ...defaultMock,
            ungroupedCount: 5
        } as any);

        render(<TabGrouper />);
        // Regenerate button has title "Regenerate suggestions"
        const regenBtn = screen.getByTitle("Regenerate suggestions");
        expect(regenBtn).toBeInTheDocument();

        fireEvent.click(regenBtn);
        expect(defaultMock.generateGroups).toHaveBeenCalled();
    });

    it('should show error message', () => {
        vi.spyOn(useTabGrouperHook, 'useTabGrouper').mockReturnValue({
            ...defaultMock,
            error: "Test Error"
        } as any);

        render(<TabGrouper />);
        expect(screen.getByText("Test Error")).toBeInTheDocument();
    });

    it('should render CleanState when no ungrouped tabs and idle', () => {
        vi.spyOn(useTabGrouperHook, 'useTabGrouper').mockReturnValue({
            ...defaultMock,
            ungroupedCount: 0
        } as any);

        render(<TabGrouper />);
        expect(screen.getByText("All tabs organized!")).toBeInTheDocument();
    });
});
