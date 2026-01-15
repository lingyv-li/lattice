import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { SelectionCard } from '../SelectionCard';
import { Check } from 'lucide-react';

describe('SelectionCard', () => {
    it('should stop propagation when clicking content area while selected', () => {
        const onToggle = vi.fn();
        render(
            <SelectionCard
                isSelected={true}
                onToggle={onToggle}
                title="Test Card"
                icon={Check}
            >
                <button data-testid="inner-action">Inner Action</button>
            </SelectionCard>
        );

        // Click inner content (simulating interaction with a child control)
        fireEvent.click(screen.getByTestId('inner-action'));

        // Should NOT fire onToggle because:
        // 1. isSelected is true (so explicit onToggle inside isn't called)
        // 2. stopPropagation prevents bubbling to outer div (which has onClick={onToggle})
        expect(onToggle).not.toHaveBeenCalled();
    });

    it('should select card when clicking content area while unselected', () => {
        const onToggle = vi.fn();
        render(
            <SelectionCard
                isSelected={false}
                onToggle={onToggle}
                title="Test Card"
                icon={Check}
            >
                <div data-testid="inner-content">Inner Content</div>
            </SelectionCard>
        );

        // Click inner content
        fireEvent.click(screen.getByTestId('inner-content'));

        // Should fire onToggle EXACTLY ONCE
        // 1. Explicit onToggle inside IS called (because !isSelected)
        // 2. stopPropagation prevents bubbling to outer div (avoiding double toggle)
        expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it('should toggle when clicking header area', () => {
        const onToggle = vi.fn();
        render(
            <SelectionCard
                isSelected={true}
                onToggle={onToggle}
                title="Test Card"
                icon={Check}
            >
                <div data-testid="inner-content">Inner Content</div>
            </SelectionCard>
        );

        // Find the title (part of header/outer container)
        // Note: Title is inside a div, bubbling should reach outer container
        fireEvent.click(screen.getByText('Test Card'));

        expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it('should be keyboard accessible', () => {
        const onToggle = vi.fn();
        render(
            <SelectionCard
                isSelected={false}
                onToggle={onToggle}
                title="Test Card"
                icon={Check}
            >
                <div />
            </SelectionCard>
        );

        const card = screen.getByRole('checkbox');

        // Check accessibility attributes
        expect(card).toHaveAttribute('aria-checked', 'false');
        expect(card).toHaveAttribute('tabIndex', '0');

        // Test Enter key
        fireEvent.keyDown(card, { key: 'Enter' });
        expect(onToggle).toHaveBeenCalledTimes(1);

        // Test Space key
        fireEvent.keyDown(card, { key: ' ' });
        expect(onToggle).toHaveBeenCalledTimes(2);
    });

    it('should show correct accessibility state when disabled', () => {
        const onToggle = vi.fn();
        render(
            <SelectionCard
                isSelected={false}
                onToggle={onToggle}
                title="Test Card"
                icon={Check}
                disabled={true}
            >
                <div />
            </SelectionCard>
        );

        const card = screen.getByRole('checkbox');

        // Check accessibility attributes for disabled state
        expect(card).toHaveAttribute('aria-disabled', 'true');
        expect(card).toHaveAttribute('tabIndex', '-1');

        // Should not toggle on keyboard
        fireEvent.keyDown(card, { key: 'Enter' });
        expect(onToggle).not.toHaveBeenCalled();
    });
});
