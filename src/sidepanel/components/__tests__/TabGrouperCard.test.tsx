import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TabGrouperCard } from '../TabGrouperCard';
import { OrganizerStatus } from '../../../types/organizer';

describe('TabGrouperCard', () => {
    const mockSnapshot = {
        tabCount: 5,
        hasTab: () => true,
        getTabData: () => ({ id: 1, title: 'Test Tab', url: 'https://test.com' }),
    };

    const mockData = {
        status: OrganizerStatus.Idle,
        error: null,
        previewGroups: null,
        selectedPreviewIndices: new Set<number>(),
        snapshot: mockSnapshot,
        isBackgroundProcessing: false,
        toggleGroupSelection: vi.fn(),
        setAllGroupsSelected: vi.fn(),
        regenerateSuggestions: vi.fn(),
        triggerProcessing: vi.fn(),
        aiEnabled: true,
        applyGroups: vi.fn(),
        setPreviewGroups: vi.fn(),
    };

    it('should show ungrouped count badge when idle with ungrouped tabs', () => {
        render(
            <TabGrouperCard
                isSelected={true}
                onToggle={vi.fn()}
                data={mockData as any}
                autopilotEnabled={false}
                onAutopilotToggle={vi.fn()}
            />
        );

        // Should show the ungrouped badge
        expect(screen.getByText(/5 ungrouped/i)).toBeInTheDocument();
        // Should show the ready message
        expect(screen.getByText(/Ready to organize 5 tabs/i)).toBeInTheDocument();
    });

    it('should render Regenerate button when previewing groups', () => {
        const previewData = {
            ...mockData,
            previewGroups: [{ groupName: 'Test Group', tabIds: [1] }]
        };

        render(
            <TabGrouperCard
                isSelected={true}
                onToggle={vi.fn()}
                data={previewData as any}
                autopilotEnabled={false}
                onAutopilotToggle={vi.fn()}
            />
        );

        const regenerateBtn = screen.getByRole('button', { name: /regenerate/i });
        expect(regenerateBtn).toBeInTheDocument();

        fireEvent.click(regenerateBtn);
        expect(mockData.regenerateSuggestions).toHaveBeenCalled();
    });

    it('should show "Analyzing..." state when processing', () => {
        const processingData = {
            ...mockData,
            isBackgroundProcessing: true
        };

        render(
            <TabGrouperCard
                isSelected={true}
                onToggle={vi.fn()}
                data={processingData as any}
                autopilotEnabled={false}
                onAutopilotToggle={vi.fn()}
            />
        );

        expect(screen.getByText(/Analyzing Tabs\.\.\./i)).toBeInTheDocument();
    });
});
