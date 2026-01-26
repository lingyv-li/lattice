import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SuggestionItem } from '../SuggestionItem';
import { SuggestionType } from '../../../types/suggestions';
import { Sparkles } from 'lucide-react';

describe('SuggestionItem', () => {
    const defaultProps = {
        id: 'test-id',
        title: 'Test Suggestion',
        description: 'Test Description',
        icon: Sparkles,
        type: SuggestionType.Group,
        action: vi.fn(),
        onAction: vi.fn(),
        tabs: [
            { title: 'Tab 1', url: 'https://example.com/1', favIconUrl: 'https://example.com/icon1.png' },
            { title: 'Tab 2', url: 'https://example.com/2', favIconUrl: 'https://example.com/icon2.png' }
        ]
    };

    it('renders correctly', () => {
        const { asFragment } = render(<SuggestionItem {...defaultProps} />);
        expect(asFragment()).toMatchSnapshot();
    });

    it('renders loading state', () => {
        const { asFragment } = render(<SuggestionItem {...defaultProps} isLoading={true} />);
        expect(asFragment()).toMatchSnapshot();
    });

    it('renders disabled state', () => {
        const { asFragment } = render(<SuggestionItem {...defaultProps} disabled={true} />);
        expect(asFragment()).toMatchSnapshot();
    });

    it('handles clicks', () => {
        render(<SuggestionItem {...defaultProps} />);
        // Click the clickable container. Logic: Title is inside the clickable div.
        // H3 parent is div, that div's parent is the clickable row.
        const titleElement = screen.getByText('Test Suggestion');
        const clickableRow = titleElement.closest('div')!.parentElement!;

        fireEvent.click(clickableRow);

        expect(defaultProps.onAction).toHaveBeenCalledWith('test-id', defaultProps.action);
    });

    it('groups identical tabs visually', () => {
        const props = {
            ...defaultProps,
            tabs: [
                { title: 'Same', url: 'https://same.com', favIconUrl: 'icon.png' },
                { title: 'Same', url: 'https://same.com', favIconUrl: 'icon.png' }
            ]
        };
        render(<SuggestionItem {...props} />);
        expect(screen.getByText('x2')).toBeInTheDocument();
    });
});
