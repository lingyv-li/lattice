import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TabGrouperCard } from '../TabGrouperCard';
import { OrganizerStatus } from '../../../types/organizer';

describe('TabGrouperCard', () => {
    const mockData = {
        status: OrganizerStatus.Idle,
        error: null,
        previewGroups: null,
        selectedPreviewIndices: new Set<number>(),
        tabDataMap: new Map(),
        ungroupedCount: 5,
        isBackgroundProcessing: false,
        toggleGroupSelection: vi.fn(),
        setAllGroupsSelected: vi.fn(),
        regenerateSuggestions: vi.fn(),
        triggerProcessing: vi.fn(),
        aiEnabled: true,
        applyGroups: vi.fn(),
        setPreviewGroups: vi.fn(),
    };

    it('should render Analyze button when idle with ungrouped tabs', () => {
        render(
            <TabGrouperCard
                isSelected={true}
                onToggle={vi.fn()}
                data={mockData as any}
                autopilotEnabled={false}
                onAutopilotToggle={vi.fn()}
            />
        );

        const analyzeBtn = screen.getByRole('button', { name: /analyze/i });
        expect(analyzeBtn).toBeInTheDocument();

        fireEvent.click(analyzeBtn);
        expect(mockData.triggerProcessing).toHaveBeenCalled();
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

    it('should show "Analyzing..." state and hide buttons when processing', () => {
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
        expect(screen.queryByRole('button', { name: /analyze/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /regenerate/i })).not.toBeInTheDocument();
    });
});
